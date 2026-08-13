export {
  DOC_CONTENT_LOADERS,
  DOC_DOMAINS,
  DOC_GROUPS,
  DOC_SUMMARIES,
  type DocArea,
  type DocContent,
  type DocDomain,
  type DocGroup,
  type DocHeading,
  type DocKind,
  type DocSummary,
} from './generated/docs-index';

export {
  loadSearchEntries,
  searchDocs,
  splitByMatches,
  type SearchEntry,
  type SearchHit,
  type SearchSection,
  type TextSegment,
} from './search';
