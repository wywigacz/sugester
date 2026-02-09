FROM docker.elastic.co/elasticsearch/elasticsearch:8.17.0

# Install Polish analysis plugins
RUN bin/elasticsearch-plugin install --batch analysis-stempel
RUN bin/elasticsearch-plugin install --batch analysis-icu
RUN bin/elasticsearch-plugin install --batch \
    pl.allegro.tech.elasticsearch.plugin:elasticsearch-analysis-morfologik:8.17.0

# Copy synonym files into ES config directory
COPY synonyms/ /usr/share/elasticsearch/config/analysis/
