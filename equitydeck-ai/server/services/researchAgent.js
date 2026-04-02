const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a professional equity analyst specializing in the Saudi stock market (TASI). You have access to real-time web search. Use it to find the latest annual reports, earnings transcripts, CMA filings, and IFRS financials before writing.

Before writing, search for:
1. "[COMPANY] annual report [YEAR]"
2. "[COMPANY] Tadawul earnings results"
3. "[COMPANY] CMA investor presentation"
4. "[COMPANY] IFRS revenue profit margin"
5. "[COMPANY] Vision 2030 government contract"

Then write a high-quality company brief for long-term TASI investors.

Use only verifiable, factual information. Be concise, analytical, and concrete — no filler or marketing language.

OUTPUT FORMAT (use these exact section headers):

## Executive Summary
## 1. What They Sell and Who Buys
## 2. How They Make Money
## 3. Revenue Quality
## 4. Cost Structure
## 5. Capital Intensity
## 6. Growth Drivers
## 7. Competitive Edge

After the report, append this block with no other text around it:
<EXTRACTED_DATA>
{ ...complete JSON matching the shared schema... }
</EXTRACTED_DATA>

The JSON must be valid and parseable. All financial figures in SAR millions as numbers (not strings). Colors as 6-char hex without #.`;

/**
 * Stream research for a company. Returns an async generator that yields text chunks.
 * After completion, returns { fullText, extractedData }.
 */
async function* streamResearch(companyName, ticker) {
  const userMessage = `Research and write the full equity brief for:
Company: ${companyName}
Ticker:  ${ticker}
Exchange: TASI (Tadawul)`;

  let fullText = '';
  let extractedData = null;

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: 8000,
    tools: [{ type: 'web_search_20250305' }],
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        const chunk = event.delta.text;
        fullText += chunk;
        yield { type: 'text', chunk };
      }
      // tool_use deltas are silently ignored
    }
  }

  // Extract JSON from <EXTRACTED_DATA> tags
  const match = fullText.match(/<EXTRACTED_DATA>([\s\S]*?)<\/EXTRACTED_DATA>/);
  if (match) {
    try {
      extractedData = JSON.parse(match[1].trim());
    } catch (e) {
      console.error('Failed to parse extracted data JSON:', e.message);
      extractedData = null;
    }
  }

  return { fullText, extractedData };
}

/**
 * Non-streaming revision of an existing report based on user feedback.
 */
async function reviseReport(currentReport, feedback) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Here is the current equity research report:\n\n${currentReport}\n\nUser feedback: ${feedback}\n\nPlease revise the report incorporating this feedback, then provide the updated <EXTRACTED_DATA> JSON block at the end.`,
      },
    ],
  });

  const revisedReport = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  let data = null;
  const match = revisedReport.match(/<EXTRACTED_DATA>([\s\S]*?)<\/EXTRACTED_DATA>/);
  if (match) {
    try {
      data = JSON.parse(match[1].trim());
    } catch (e) {
      console.error('Failed to parse revised extracted data:', e.message);
    }
  }

  return { revisedReport, data };
}

module.exports = { streamResearch, reviseReport };
