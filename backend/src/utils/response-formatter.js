/**
 * Transform Elasticsearch hits into clean API responses.
 */

export function formatProduct(hit) {
  const src = hit._source || {};
  return {
    id: src.id,
    sku: src.sku,
    ean: src.ean,
    name: src.name,
    description: src.description,
    brand: src.brand,
    category: src.category,
    subcategory: src.subcategory,
    section_name: src.section_name,
    category_path: src.category_path,
    price: src.price,
    sale_price: src.sale_price,
    is_promo: src.is_promo || false,
    currency: src.currency || 'PLN',
    availability: src.availability || 'in_stock',
    image_url: src.image_url,
    product_url: src.product_url,
    has_image: src.has_image !== false,
    condition: src.condition,
    avg_rating: src.avg_rating,
    review_count: src.review_count,
    is_new: src.is_new || false,
    is_bestseller: src.is_bestseller || false,
    is_highlighted: src.is_highlighted || false,
    is_pinned: src._pinned || false,
    score: hit._score,
    // GA4 analytics scores (when available)
    ...(src.ga4 ? {
      ga4: {
        popularity_score: src.ga4.popularity_score || 0,
        conversion_score: src.ga4.conversion_score || 0,
        trending_score: src.ga4.trending_score || 0,
      },
    } : {}),
  };
}

export function formatProducts(hits) {
  return (hits || []).map(formatProduct);
}

export function formatSuggestion(option) {
  return {
    text: option.text || option._source?.name,
    score: option._score,
  };
}

export function formatCategoryBucket(bucket) {
  return {
    name: bucket.key,
    count: bucket.doc_count,
  };
}

export function formatBrandBucket(bucket) {
  return {
    name: bucket.key,
    count: bucket.doc_count,
  };
}

export function formatFacets(aggregations) {
  if (!aggregations) return {};
  const facets = {};

  if (aggregations.brands) {
    facets.brand = (aggregations.brands.buckets || []).map(formatBrandBucket);
  }
  if (aggregations.categories) {
    facets.category = (aggregations.categories.buckets || []).map(formatCategoryBucket);
  }
  if (aggregations.availability_facet) {
    facets.availability = (aggregations.availability_facet.buckets || []).map((b) => ({
      name: b.key,
      count: b.doc_count,
    }));
  }
  if (aggregations.mounts) {
    facets.mount = (aggregations.mounts.buckets || []).map((b) => ({
      name: b.key,
      count: b.doc_count,
    }));
  }
  if (aggregations.price_ranges) {
    facets.price_ranges = (aggregations.price_ranges.buckets || []).map((b) => ({
      key: b.key,
      from: b.from,
      to: b.to,
      count: b.doc_count,
    }));
  }

  return facets;
}

export function formatAutocompleteResponse(query, { suggestions, categories, brands, products }) {
  return {
    query,
    suggestions: suggestions || [],
    categories: categories || [],
    brands: brands || [],
    products: products || [],
  };
}

export function formatSearchResponse(query, { total, page, perPage, products, facets, didYouMean }) {
  const response = {
    query,
    total: total || 0,
    page: page || 1,
    per_page: perPage || 20,
    products: products || [],
    facets: facets || {},
  };
  if (didYouMean) {
    response.did_you_mean = didYouMean;
  }
  return response;
}
