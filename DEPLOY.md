# Wdrożenie Sugester na mikr.us VPS

## Wymagania

### Serwer mikr.us
- **Minimalny plan**: Mikrus 3.5 (4GB RAM, 197 PLN/rok)
- **Zalecany plan**: Mikrus 4.1 (8GB RAM, 395 PLN/rok) — dla bezpieczeństwa z ES
- Docker musi być zainstalowany (plany 2.1+)
- Domena techniczna: `*.wykr.es` (automatyczna) lub `*.bieda.it` (customowa)

### Podłączanie domeny technicznej z mikr.us
1. Zaloguj się do panelu mikr.us
2. W sekcji "Domeny techniczne" dodaj subdomenę (np. `sugester.bieda.it`)
3. Subdomena zostanie automatycznie skierowana na Twój serwer VPS
4. Alternatywnie: `*.wykr.es` jest przypisywana automatycznie do serwera

## Szybki start (3 komendy)

```bash
# 1. Sklonuj repozytorium na serwer
git clone <URL_REPOZYTORIUM> /opt/sugester
cd /opt/sugester

# 2. Ustaw wymagany parametr kernela dla Elasticsearch
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf

# 3. Uruchom pełne wdrożenie
chmod +x deploy.sh
./deploy.sh init
```

## Instrukcja krok po kroku

### 1. Połącz się z serwerem
```bash
# mikr.us udostępnia SSH na niestandardowym porcie
# Sprawdź dane w panelu mikr.us
ssh root@srvXX.mikr.us -p PORT
```

### 2. Zainstaluj Docker (jeśli nie zainstalowany)
```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
```

### 3. Sklonuj repozytorium
```bash
cd /opt
git clone <URL_REPOZYTORIUM> sugester
cd sugester
```

Alternatywnie (bez git, kopiowanie z lokalnej maszyny):
```bash
# Na lokalnej maszynie (Windows):
scp -P PORT -r . root@srvXX.mikr.us:/opt/sugester/

# Lub przez rsync:
rsync -avz -e "ssh -p PORT" . root@srvXX.mikr.us:/opt/sugester/
```

### 4. Konfiguracja środowiska
`.env.production` jest już skonfigurowany z wartościami domyślnymi. Dostosuj jeśli trzeba:
```bash
nano .env.production
```

Domyślna zawartość:
```env
ES_URL=http://elasticsearch:9200
REDIS_URL=redis://redis:6379
INDEX_NAME=products
PORT=3000
NODE_ENV=production
```

### 5. Wdrożenie
```bash
chmod +x deploy.sh
./deploy.sh init
```

Skrypt automatycznie:
- Ustawi `vm.max_map_count` dla Elasticsearch
- Zbuduje wszystkie kontenery Docker
- Uruchomi ES, Redis, Backend, Nginx
- Poczeka aż ES będzie gotowy
- Stworzy indeks z analizatorami (Morfologik, Stempel, ICU)
- Zaimportuje pełny feed produktowy z Cyfrowe.pl (17 000+ produktów)

### 6. Weryfikacja
```bash
# Sprawdź status kontenerów
./deploy.sh status

# Sprawdź logi
./deploy.sh logs

# Test API
curl http://localhost/health
curl "http://localhost/api/autocomplete?q=canon"
curl "http://localhost/api/autocomplete?q=sony+a7"

# Otwórz demo w przeglądarce
# http://TWOJA_DOMENA/demo.html
```

## Komendy deploy.sh

| Komenda | Opis |
|---------|------|
| `./deploy.sh init` | Pierwsza instalacja (budowa + import danych) |
| `./deploy.sh update` | Aktualizacja backendu (przebudowa + restart) |
| `./deploy.sh update --with-data` | Aktualizacja + ponowny import feedu |
| `./deploy.sh rebuild` | Pełna przebudowa (wszystkie kontenery + dane) |
| `./deploy.sh reimport` | Ponowny import feedu + czyszczenie cache |
| `./deploy.sh status` | Status kontenerów i health check |
| `./deploy.sh logs` | Logi (wszystkie usługi) |
| `./deploy.sh logs backend` | Logi tylko backendu |
| `./deploy.sh restart` | Restart wszystkich usług |
| `./deploy.sh stop` | Zatrzymanie wszystkiego |

## Automatyczne aktualizacje feedu (crontab)

```bash
crontab -e
```

Dodaj:
```cron
# Aktualizacja feedu produktowego co 6 godzin
0 */6 * * * cd /opt/sugester && docker exec sugester-backend node scripts/import-feed.js --cyfrowe >> /var/log/sugester-feed.log 2>&1

# Czyszczenie cache Redis po imporcie (1 min po imporcie)
1 */6 * * * docker exec sugester-redis redis-cli FLUSHALL >> /var/log/sugester-cache.log 2>&1
```

## Architektura produkcyjna

```
Internet
   |
   v
[Nginx :80] ── rate limiting, gzip, cache headers
   |
   v
[Node.js/Fastify :3000] ── API + frontend static
   |
   +──> [Elasticsearch :9200] ── wyszukiwanie, indeksowanie
   |       (Morfologik + Stempel + ICU)
   |
   +──> [Redis :6379] ── cache wyników (LRU, 128MB limit)
```

### Zużycie pamięci (szacunki)
| Usługa | Limit | Typowe użycie |
|--------|-------|---------------|
| Elasticsearch | 1.5 GB | 1.0-1.3 GB |
| Node.js backend | 256 MB | 80-150 MB |
| Redis | 192 MB | 20-80 MB |
| Nginx | 64 MB | 10-30 MB |
| **RAZEM** | **~2 GB** | **~1.5 GB** |

Na planie 4GB RAM zostaje ~2 GB na system operacyjny i inne procesy.

## Troubleshooting

### Elasticsearch nie startuje
```bash
# Sprawdź logi ES
./deploy.sh logs elasticsearch

# Typowy problem: za mało pamięci dla vm.max_map_count
sudo sysctl -w vm.max_map_count=262144

# Restart
./deploy.sh restart
```

### Out of Memory
```bash
# Zmniejsz pamięć ES (minimum 512MB, ale wolniejsze)
# Edytuj docker/docker-compose.prod.yml:
#   ES_JAVA_OPTS=-Xms512m -Xmx512m
#   limits.memory: 768M
```

### Backend nie łączy się z ES
```bash
# Sprawdź czy ES jest zdrowy
docker exec sugester-es curl -s http://localhost:9200/_cluster/health

# Sprawdź sieć Docker
docker network inspect sugester_sugester-net
```

### Pusta baza produktów
```bash
# Ręczny import feedu
./deploy.sh reimport

# Lub z pliku lokalnego
docker exec sugester-backend node scripts/import-feed.js --file data/feed-cyfrowe.json
```

### Reset wszystkiego
```bash
./deploy.sh stop
docker volume rm sugester_es-data sugester_redis-data
./deploy.sh init
```
