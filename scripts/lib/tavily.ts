type TavilySearchDepth = "advanced" | "basic" | "fast" | "ultra-fast";
type TavilySearchTopic = "general" | "news" | "finance";
type TavilyIncludeAnswer = boolean | "basic" | "advanced";
type TavilyIncludeRawContent = boolean | "markdown" | "text";
type TavilyTimeRange = "day" | "week" | "month" | "year" | "d" | "w" | "m" | "y";

export type TavilySearchResult = {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string | null;
  score?: number;
};

type TavilySearchResponse = {
  answer?: string;
  results?: TavilySearchResult[];
  usage?: {
    credits?: number;
  };
};

type TavilySearchOptions = {
  chunksPerSource?: number;
  endDate?: string;
  exactMatch?: boolean;
  excludeDomains?: string[];
  includeAnswer?: TavilyIncludeAnswer;
  includeDomains?: string[];
  includeImages?: boolean;
  includeRawContent?: TavilyIncludeRawContent;
  includeUsage?: boolean;
  maxResults?: number;
  searchDepth?: TavilySearchDepth;
  startDate?: string;
  timeRange?: TavilyTimeRange;
  topic?: TavilySearchTopic;
};

const TAVILY_API_URL = "https://api.tavily.com/search";

export async function tavilySearch(query: string, options: TavilySearchOptions = {}): Promise<TavilySearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing TAVILY_API_KEY.");
  }

  const response = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      query,
      search_depth: options.searchDepth ?? "basic",
      chunks_per_source: options.chunksPerSource,
      topic: options.topic ?? "general",
      time_range: options.timeRange,
      start_date: options.startDate,
      end_date: options.endDate,
      max_results: options.maxResults ?? 5,
      include_answer: options.includeAnswer ?? false,
      include_raw_content: options.includeRawContent ?? false,
      include_images: options.includeImages ?? false,
      include_domains: options.includeDomains,
      exclude_domains: options.excludeDomains,
      exact_match: options.exactMatch ?? false,
      include_usage: options.includeUsage ?? false
    })
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed (${response.status} ${response.statusText})`);
  }

  return (await response.json()) as TavilySearchResponse;
}
