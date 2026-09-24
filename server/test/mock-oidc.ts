// Emissor OIDC simulado para os testes: descoberta, JWKS e endpoint de token.
// Assina id_token RS256 de verdade e confere PKCE e autenticação do cliente,
// para exercitar o fluxo inteiro sem depender da Microsoft ou do Google.
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

export interface MockIdp {
  issuer: string;
  clientId: string;
  clientSecret: string;
  // Registra o código que o "navegador" traria no callback, com as claims do usuário.
  issueCode(params: URLSearchParams, claims: Record<string, unknown>, opts?: { nonce?: string; aud?: string }): string;
  close(): Promise<void>;
}

export async function startMockIdp(): Promise<MockIdp> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const clientId = 'greenia-teste';
  const clientSecret = 'segredo-de-teste';
  const codes = new Map<string, { challenge: string; nonce: string; claims: Record<string, unknown>; aud: string; redirectUri: string }>();
  let n = 0;
  let issuer = '';

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', issuer);
    const json = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url.pathname === '/.well-known/openid-configuration') {
      return json(200, {
        issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token', jwks_uri: issuer + '/jwks',
        response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      });
    }
    if (url.pathname === '/jwks') return json(200, { keys: [jwk] });
    if (url.pathname === '/token' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const p = new URLSearchParams(body);
      const basic = String(req.headers.authorization || '').replace(/^Basic /, '');
      const [id, secret] = basic ? Buffer.from(basic, 'base64').toString().split(':').map(decodeURIComponent) : [p.get('client_id'), p.get('client_secret')];
      if (id !== clientId || secret !== clientSecret) return json(401, { error: 'invalid_client' });
      const c = codes.get(p.get('code') || '');
      codes.delete(p.get('code') || '');
      if (!c) return json(400, { error: 'invalid_grant' });
      const challenge = createHash('sha256').update(p.get('code_verifier') || '').digest('base64url');
      if (challenge !== c.challenge || p.get('redirect_uri') !== c.redirectUri) return json(400, { error: 'invalid_grant' });
      const idToken = await new SignJWT({ ...c.claims, nonce: c.nonce })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(issuer).setAudience(c.aud).setSubject(String(c.claims.sub || 'sub-' + (++n)))
        .setIssuedAt().setExpirationTime('5m').sign(privateKey);
      return json(200, { access_token: 'at-' + n, token_type: 'Bearer', expires_in: 300, id_token: idToken });
    }
    json(404, { error: 'not_found' });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  issuer = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

  return {
    issuer, clientId, clientSecret,
    issueCode(params, claims, opts = {}) {
      const code = 'code-' + (++n);
      codes.set(code, {
        challenge: params.get('code_challenge') || '',
        nonce: opts.nonce ?? params.get('nonce') ?? '',
        claims, aud: opts.aud ?? clientId,
        redirectUri: params.get('redirect_uri') || '',
      });
      return code;
    },
    close: () => new Promise<void>(r => server.close(() => r())),
  };
}
