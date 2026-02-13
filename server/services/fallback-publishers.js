/**
 * Hardcoded fallback publisher suggestions when Gemini API is unavailable.
 */

const FALLBACK_DATA = {
  Germany: {
    Sports: [
      { url: 'https://www.kicker.de', name: 'Kicker', reason: 'Leading German football/sports magazine and portal' },
      { url: 'https://www.sport1.de', name: 'Sport1', reason: 'Major German multi-sport news platform' },
      { url: 'https://www.sportschau.de', name: 'Sportschau', reason: 'ARD public broadcaster sports section' },
    ],
    Finance: [
      { url: 'https://www.handelsblatt.com', name: 'Handelsblatt', reason: 'Leading German business and finance newspaper' },
      { url: 'https://www.finanzen.net', name: 'Finanzen.net', reason: 'Major German financial news and market data portal' },
      { url: 'https://www.boerse-online.de', name: 'Börse Online', reason: 'Established German stock market and investment portal' },
    ],
    News: [
      { url: 'https://www.spiegel.de', name: 'Der Spiegel', reason: 'Germany\'s most influential news magazine' },
      { url: 'https://www.focus.de', name: 'Focus Online', reason: 'Major German news magazine with broad coverage' },
      { url: 'https://www.zeit.de', name: 'Die Zeit', reason: 'Renowned German weekly newspaper' },
    ],
    Tech: [
      { url: 'https://www.heise.de', name: 'Heise Online', reason: 'Leading German technology news portal' },
      { url: 'https://www.chip.de', name: 'CHIP', reason: 'Major German tech magazine and review site' },
      { url: 'https://www.golem.de', name: 'Golem.de', reason: 'German IT news and technology portal' },
    ],
    Automotive: [
      { url: 'https://www.auto-motor-und-sport.de', name: 'Auto Motor und Sport', reason: 'Leading German automotive magazine' },
      { url: 'https://www.autobild.de', name: 'Auto Bild', reason: 'Germany\'s largest automotive publication' },
      { url: 'https://www.mobile.de', name: 'Mobile.de', reason: 'Major German automotive marketplace and news' },
    ],
    Lifestyle: [
      { url: 'https://www.brigitte.de', name: 'Brigitte', reason: 'Major German lifestyle and women\'s magazine' },
      { url: 'https://www.stern.de', name: 'Stern', reason: 'German lifestyle and news magazine' },
      { url: 'https://www.gala.de', name: 'Gala', reason: 'German celebrity and lifestyle magazine' },
    ],
    Cooking: [
      { url: 'https://www.chefkoch.de', name: 'Chefkoch', reason: 'Germany\'s largest cooking community and recipe platform' },
      { url: 'https://www.lecker.de', name: 'Lecker', reason: 'Popular German food and recipe magazine' },
      { url: 'https://www.essen-und-trinken.de', name: 'Essen & Trinken', reason: 'Premium German food magazine' },
    ],
    Travel: [
      { url: 'https://www.geo.de', name: 'GEO', reason: 'Leading German travel and geography magazine' },
      { url: 'https://www.travelbook.de', name: 'Travelbook', reason: 'German digital travel magazine by Axel Springer' },
      { url: 'https://www.urlaubsguru.de', name: 'Urlaubsguru', reason: 'Major German travel deals and inspiration portal' },
    ],
  },
  Austria: {
    News: [
      { url: 'https://www.derstandard.at', name: 'Der Standard', reason: 'Leading Austrian quality newspaper' },
      { url: 'https://www.krone.at', name: 'Kronen Zeitung', reason: 'Austria\'s highest-circulation daily newspaper' },
      { url: 'https://www.orf.at', name: 'ORF', reason: 'Austrian public broadcaster' },
    ],
    Sports: [
      { url: 'https://www.laola1.at', name: 'LAOLA1', reason: 'Leading Austrian sports portal' },
      { url: 'https://sport.orf.at', name: 'ORF Sport', reason: 'Austrian public broadcaster sports section' },
      { url: 'https://www.krone.at/sport', name: 'Krone Sport', reason: 'Kronen Zeitung sports section' },
    ],
  },
  Switzerland: {
    News: [
      { url: 'https://www.20min.ch', name: '20 Minuten', reason: 'Switzerland\'s most-read newspaper' },
      { url: 'https://www.blick.ch', name: 'Blick', reason: 'Major Swiss German-language tabloid' },
      { url: 'https://www.nzz.ch', name: 'NZZ', reason: 'Renowned Swiss quality newspaper' },
    ],
    Sports: [
      { url: 'https://www.blick.ch/sport/', name: 'Blick Sport', reason: 'Major Swiss sports coverage' },
      { url: 'https://www.20min.ch/sport', name: '20 Minuten Sport', reason: 'Swiss sports news' },
      { url: 'https://www.watson.ch/sport', name: 'Watson Sport', reason: 'Swiss digital media sports section' },
    ],
  },
  'United Kingdom': {
    News: [
      { url: 'https://www.bbc.co.uk/news', name: 'BBC News', reason: 'UK\'s most trusted news source' },
      { url: 'https://www.theguardian.com', name: 'The Guardian', reason: 'Major UK broadsheet newspaper' },
      { url: 'https://www.dailymail.co.uk', name: 'Daily Mail', reason: 'UK\'s highest-traffic newspaper website' },
    ],
    Sports: [
      { url: 'https://www.bbc.co.uk/sport', name: 'BBC Sport', reason: 'UK\'s most popular sports platform' },
      { url: 'https://www.skysports.com', name: 'Sky Sports', reason: 'Leading UK sports broadcaster' },
      { url: 'https://www.theguardian.com/sport', name: 'Guardian Sport', reason: 'Quality UK sports journalism' },
    ],
    Tech: [
      { url: 'https://www.theregister.com', name: 'The Register', reason: 'Popular UK tech news site' },
      { url: 'https://www.techradar.com', name: 'TechRadar', reason: 'Major UK technology reviews and news' },
      { url: 'https://www.wired.co.uk', name: 'Wired UK', reason: 'UK edition of leading tech magazine' },
    ],
    Finance: [
      { url: 'https://www.ft.com', name: 'Financial Times', reason: 'World-leading financial newspaper, based in UK' },
      { url: 'https://www.thisismoney.co.uk', name: 'This is Money', reason: 'Daily Mail\'s personal finance section' },
      { url: 'https://www.cityam.com', name: 'City A.M.', reason: 'London-based free financial newspaper' },
    ],
  },
  France: {
    News: [
      { url: 'https://www.lemonde.fr', name: 'Le Monde', reason: 'France\'s most prestigious newspaper' },
      { url: 'https://www.lefigaro.fr', name: 'Le Figaro', reason: 'Major French daily newspaper' },
      { url: 'https://www.20minutes.fr', name: '20 Minutes', reason: 'Most-read free newspaper in France' },
    ],
    Sports: [
      { url: 'https://www.lequipe.fr', name: 'L\'Equipe', reason: 'France\'s leading sports daily' },
      { url: 'https://rmcsport.bfmtv.com', name: 'RMC Sport', reason: 'Major French sports news platform' },
      { url: 'https://www.eurosport.fr', name: 'Eurosport France', reason: 'Multi-sport coverage in France' },
    ],
  },
  Italy: {
    News: [
      { url: 'https://www.repubblica.it', name: 'La Repubblica', reason: 'Italy\'s most-read online newspaper' },
      { url: 'https://www.corriere.it', name: 'Corriere della Sera', reason: 'Italy\'s oldest and most prestigious daily' },
      { url: 'https://www.ansa.it', name: 'ANSA', reason: 'Italian national news agency' },
    ],
    Sports: [
      { url: 'https://www.gazzetta.it', name: 'La Gazzetta dello Sport', reason: 'Italy\'s leading sports daily' },
      { url: 'https://www.corrieredellosport.it', name: 'Corriere dello Sport', reason: 'Major Italian sports newspaper' },
      { url: 'https://sport.sky.it', name: 'Sky Sport Italia', reason: 'Leading Italian sports broadcaster' },
    ],
  },
  Spain: {
    News: [
      { url: 'https://elpais.com', name: 'El País', reason: 'Spain\'s largest newspaper' },
      { url: 'https://www.elmundo.es', name: 'El Mundo', reason: 'Major Spanish daily newspaper' },
      { url: 'https://www.20minutos.es', name: '20 Minutos', reason: 'Most-read free newspaper in Spain' },
    ],
    Sports: [
      { url: 'https://www.marca.com', name: 'Marca', reason: 'Spain\'s leading sports newspaper' },
      { url: 'https://as.com', name: 'AS', reason: 'Major Spanish sports daily' },
      { url: 'https://www.mundodeportivo.com', name: 'Mundo Deportivo', reason: 'Catalan sports newspaper' },
    ],
  },
  Netherlands: {
    News: [
      { url: 'https://www.telegraaf.nl', name: 'De Telegraaf', reason: 'Netherlands\' highest-circulation daily' },
      { url: 'https://www.nu.nl', name: 'NU.nl', reason: 'Most-visited Dutch news website' },
      { url: 'https://www.volkskrant.nl', name: 'De Volkskrant', reason: 'Major Dutch quality newspaper' },
    ],
    Sports: [
      { url: 'https://www.vi.nl', name: 'Voetbal International', reason: 'Netherlands\' leading football magazine' },
      { url: 'https://nos.nl/sport', name: 'NOS Sport', reason: 'Dutch public broadcaster sports section' },
      { url: 'https://www.ad.nl/sport', name: 'AD Sport', reason: 'Algemeen Dagblad sports section' },
    ],
  },
  Poland: {
    News: [
      { url: 'https://www.wp.pl', name: 'Wirtualna Polska', reason: 'Poland\'s largest web portal' },
      { url: 'https://www.onet.pl', name: 'Onet', reason: 'Major Polish internet portal' },
      { url: 'https://www.gazeta.pl', name: 'Gazeta.pl', reason: 'Leading Polish online news portal' },
    ],
    Sports: [
      { url: 'https://www.sport.pl', name: 'Sport.pl', reason: 'Major Polish sports portal' },
      { url: 'https://www.przegladysportowy.pl', name: 'Przegląd Sportowy', reason: 'Poland\'s oldest sports newspaper' },
      { url: 'https://sportowefakty.wp.pl', name: 'Sportowe Fakty', reason: 'WP sports news section' },
    ],
  },
};

/**
 * Get fallback publisher suggestions for a given topic and country.
 */
function getFallbackPublishers(topic, country) {
  // Try exact match
  const countryData = FALLBACK_DATA[country];
  if (countryData) {
    // Try exact topic match
    if (countryData[topic]) {
      return countryData[topic];
    }
    // Try case-insensitive topic match
    const topicKey = Object.keys(countryData).find(
      k => k.toLowerCase() === topic.toLowerCase()
    );
    if (topicKey) {
      return countryData[topicKey];
    }
    // Fall back to News for that country
    if (countryData.News) {
      return countryData.News;
    }
    // Return first available topic
    const firstTopic = Object.keys(countryData)[0];
    return countryData[firstTopic];
  }

  // Ultimate fallback: German news sites
  return FALLBACK_DATA.Germany.News;
}

module.exports = {
  getFallbackPublishers,
  FALLBACK_DATA,
};
