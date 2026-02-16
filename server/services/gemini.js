/**
 * Google Gemini API integration for website suggestions.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getFallbackPublishers } = require('./fallback-publishers');
const { BLOCKED_DOMAINS } = require('./blocked-domains');

let genAI = null;

function getClient() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Check if a URL belongs to a blocked domain.
 */
function isBlockedDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return BLOCKED_DOMAINS.some(blocked => {
      if (blocked.includes('*')) {
        // Wildcard match (e.g. amazon.*)
        const prefix = blocked.replace('.*', '');
        return hostname.startsWith(prefix);
      }
      return hostname === blocked || hostname.endsWith('.' + blocked);
    });
  } catch {
    return false;
  }
}

/**
 * Suggest publisher websites based on topic and country.
 * Falls back to hardcoded list if Gemini API fails.
 */
async function suggestWebsites(topic, country) {
  const blockedList = BLOCKED_DOMAINS.join(', ');

  const prompt = `You are a digital media planning assistant. Given a topic/vertical and a target country, suggest exactly 3 real, active publisher websites that:
1. Are major, well-known publishers in that country for the given topic
2. Have standard IAB display ad placements
3. Are freely accessible (no hard paywall blocking all content)
4. Have a desktop and mobile version
5. URL should point to a topic-relevant section/subdomain/path whenever possible (not generic homepage unless no section URL exists)

IMPORTANT: Do NOT suggest any of the following domains (social platforms, search engines, aggregators, ecommerce, video platforms):
${blockedList}

Topic: ${topic}
Country: ${country}

Respond ONLY in this exact JSON format, no other text:
{
  "suggestions": [
    {
      "url": "https://www.example.com/topic-or-section",
      "name": "Example Publisher",
      "reason": "Brief reason why this fits the topic/country"
    }
  ]
}`;

  try {
    const client = getClient();
    const model = client.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
      },
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    if (parsed.suggestions && Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
      // Validate each suggestion has required fields and isn't a blocked domain
      const valid = parsed.suggestions.filter(
        s => s.url && s.name && s.reason && !isBlockedDomain(s.url)
      );
      if (valid.length > 0) {
        return valid.slice(0, 3);
      }
    }

    throw new Error('Invalid response structure from Gemini');
  } catch (err) {
    console.error('Gemini API failed, using fallback:', err.message);
    return getFallbackPublishers(topic, country);
  }
}

module.exports = {
  suggestWebsites,
  isBlockedDomain,
};
