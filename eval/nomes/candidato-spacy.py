# Candidato C: NER do spaCy (pt_core_news_lg), entidades PER.
#   python candidato-spacy.py conjunto.json  ->  JSON {"nomes": [[...], ...], "ms": total}
# Instalação (fora do projeto, num venv):
#   pip install spacy https://github.com/explosion/spacy-models/releases/download/pt_core_news_lg-3.8.0/pt_core_news_lg-3.8.0-py3-none-any.whl
import json, sys, time
import spacy

nlp = spacy.load('pt_core_news_lg')
exemplos = json.load(open(sys.argv[1], encoding='utf-8'))['exemplos']
nlp('aquecimento')
t0 = time.perf_counter()
nomes = [[e.text for e in nlp(ex['texto']).ents if e.label_ == 'PER'] for ex in exemplos]
ms = (time.perf_counter() - t0) * 1000
print(json.dumps({'nomes': nomes, 'ms': ms}, ensure_ascii=False))
