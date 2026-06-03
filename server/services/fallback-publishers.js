/**
 * Curated publisher corpus used when Gemini is unavailable or returns weak data.
 *
 * The corpus intentionally over-supplies candidates per country. The suggestion
 * route runs preflight scoring afterwards, so this list optimizes for breadth
 * and country relevance rather than trying to pre-pick the final sites.
 */

const TOPIC_ALIASES = {
  sports: ['sports', 'sport', 'football', 'soccer', 'fussball', 'formula1', 'motorsport'],
  finance: ['finance', 'business', 'money', 'markets', 'wirtschaft', 'boerse', 'economy'],
  news: ['news', 'politics', 'world', 'nachrichten', 'general'],
  tech: ['tech', 'technology', 'digital', 'it', 'software', 'ai', 'ki', 'security'],
  automotive: ['automotive', 'auto', 'cars', 'motoring', 'mobility'],
  lifestyle: ['lifestyle', 'fashion', 'celebrity', 'home', 'living', 'health'],
  cooking: ['cooking', 'food', 'recipe', 'recipes', 'essen', 'cuisine'],
  travel: ['travel', 'tourism', 'reisen', 'holiday', 'vacation'],
};

function p(url, name, topics, reason) {
  return { url, name, topics: topics.split(','), reason };
}

const PUBLISHER_CORPUS = {
  Germany: [
    p('https://www.spiegel.de', 'Der Spiegel', 'news,lifestyle', 'Major German national news publisher'),
    p('https://www.zeit.de', 'Die Zeit', 'news,lifestyle', 'German weekly newspaper with broad editorial coverage'),
    p('https://www.faz.net', 'Frankfurter Allgemeine Zeitung', 'news,finance', 'German national newspaper with business coverage'),
    p('https://www.sueddeutsche.de', 'Sueddeutsche Zeitung', 'news', 'German national newspaper'),
    p('https://www.welt.de', 'Welt', 'news,finance,lifestyle', 'German national news publisher'),
    p('https://www.focus.de', 'Focus Online', 'news,lifestyle', 'Large German news and magazine site'),
    p('https://www.stern.de', 'Stern', 'news,lifestyle', 'German news and lifestyle magazine'),
    p('https://www.tagesschau.de', 'Tagesschau', 'news', 'German public broadcaster news site'),
    p('https://www.n-tv.de', 'n-tv', 'news,finance', 'German news and business publisher'),
    p('https://www.handelsblatt.com', 'Handelsblatt', 'finance,news', 'German business and finance newspaper'),
    p('https://www.wiwo.de', 'WirtschaftsWoche', 'finance,news', 'German business magazine'),
    p('https://www.finanzen.net', 'Finanzen.net', 'finance', 'German finance and market-data portal'),
    p('https://www.boerse-online.de', 'Boerse Online', 'finance', 'German stock-market and investing publisher'),
    p('https://www.kicker.de', 'Kicker', 'sports', 'German football and sports publisher'),
    p('https://www.sport1.de', 'Sport1', 'sports', 'German sports news platform'),
    p('https://www.sportschau.de', 'Sportschau', 'sports', 'German public broadcaster sports site'),
    p('https://www.heise.de', 'Heise Online', 'tech', 'German technology news publisher'),
    p('https://www.golem.de', 'Golem.de', 'tech', 'German IT and technology news site'),
    p('https://www.chip.de', 'CHIP', 'tech', 'German technology reviews and service site'),
    p('https://t3n.de', 't3n', 'tech,finance', 'German digital business and tech publisher'),
    p('https://www.computerbild.de', 'Computer Bild', 'tech', 'German consumer technology publisher'),
    p('https://www.auto-motor-und-sport.de', 'Auto Motor und Sport', 'automotive,sports', 'German automotive magazine'),
    p('https://www.autobild.de', 'Auto Bild', 'automotive', 'German automotive publisher'),
    p('https://www.motorsport-magazin.com', 'Motorsport Magazin', 'automotive,sports', 'German motorsport publisher'),
    p('https://www.brigitte.de', 'Brigitte', 'lifestyle,cooking', 'German lifestyle and women-focused magazine'),
    p('https://www.gala.de', 'Gala', 'lifestyle', 'German celebrity and lifestyle publisher'),
    p('https://www.chefkoch.de', 'Chefkoch', 'cooking', 'German recipe and cooking portal'),
    p('https://www.lecker.de', 'Lecker', 'cooking,lifestyle', 'German food and recipe publisher'),
    p('https://www.geo.de', 'GEO', 'travel,lifestyle,news', 'German travel, science, and geography magazine'),
    p('https://www.travelbook.de', 'Travelbook', 'travel,lifestyle', 'German travel publisher'),
  ],
  Austria: [
    p('https://www.derstandard.at', 'Der Standard', 'news,tech,finance', 'Austrian national news publisher'),
    p('https://www.diepresse.com', 'Die Presse', 'news,finance', 'Austrian national newspaper'),
    p('https://kurier.at', 'Kurier', 'news,lifestyle,sports', 'Austrian daily newspaper'),
    p('https://www.krone.at', 'Kronen Zeitung', 'news,sports,lifestyle', 'Large Austrian daily news site'),
    p('https://www.kleinezeitung.at', 'Kleine Zeitung', 'news,sports,lifestyle', 'Austrian regional and national publisher'),
    p('https://www.heute.at', 'Heute', 'news,lifestyle', 'Austrian daily news portal'),
    p('https://www.oe24.at', 'OE24', 'news,sports,lifestyle', 'Austrian news and entertainment portal'),
    p('https://orf.at', 'ORF', 'news', 'Austrian public broadcaster'),
    p('https://sport.orf.at', 'ORF Sport', 'sports', 'Austrian public broadcaster sports section'),
    p('https://www.laola1.at', 'LAOLA1', 'sports', 'Austrian sports portal'),
    p('https://www.skysportaustria.at', 'Sky Sport Austria', 'sports', 'Austrian sports broadcaster site'),
    p('https://www.ligaportal.at', 'Ligaportal', 'sports', 'Austrian football publisher'),
    p('https://www.profil.at', 'Profil', 'news,finance', 'Austrian news magazine'),
    p('https://www.falter.at', 'Falter', 'news,lifestyle', 'Austrian weekly newspaper and culture publisher'),
    p('https://www.trend.at', 'trend', 'finance,news', 'Austrian business magazine'),
    p('https://www.finanzen.at', 'Finanzen.at', 'finance', 'Austrian finance portal'),
    p('https://www.boerse-express.com', 'Boerse Express', 'finance', 'Austrian stock-market publisher'),
    p('https://futurezone.at', 'futurezone', 'tech', 'Austrian technology publisher'),
    p('https://brutkasten.com', 'Der Brutkasten', 'tech,finance', 'Austrian startup and tech publisher'),
    p('https://www.motor.at', 'motor.at', 'automotive', 'Austrian automotive publisher'),
    p('https://www.autorevue.at', 'Autorevue', 'automotive', 'Austrian automotive magazine'),
    p('https://www.auto-motor.at', 'Auto & Motor', 'automotive', 'Austrian automotive site'),
    p('https://www.woman.at', 'WOMAN', 'lifestyle', 'Austrian lifestyle magazine'),
    p('https://www.miss.at', 'MISS', 'lifestyle', 'Austrian lifestyle publisher'),
    p('https://www.falstaff.com/at', 'Falstaff Austria', 'cooking,lifestyle,travel', 'Austrian food, wine, and lifestyle publisher'),
    p('https://www.gusto.at', 'Gusto', 'cooking', 'Austrian food and recipe publisher'),
    p('https://www.ichkoche.at', 'ichkoche.at', 'cooking', 'Austrian recipe portal'),
    p('https://www.bergwelten.com', 'Bergwelten', 'travel,lifestyle,sports', 'Austrian outdoor and travel publisher'),
    p('https://www.reisen-magazin.at', 'Reisen Magazin', 'travel', 'Austrian travel publisher'),
    p('https://www.meinbezirk.at', 'MeinBezirk', 'news,lifestyle', 'Austrian regional publisher network'),
  ],
  Switzerland: [
    p('https://www.20min.ch', '20 Minuten', 'news,sports,lifestyle', 'Large Swiss news publisher'),
    p('https://www.blick.ch', 'Blick', 'news,sports,lifestyle', 'Major Swiss news and sports publisher'),
    p('https://www.nzz.ch', 'Neue Zuercher Zeitung', 'news,finance', 'Swiss national newspaper'),
    p('https://www.tagesanzeiger.ch', 'Tages-Anzeiger', 'news,lifestyle', 'Swiss daily newspaper'),
    p('https://www.watson.ch', 'Watson', 'news,sports,lifestyle', 'Swiss digital news publisher'),
    p('https://www.srf.ch/news', 'SRF News', 'news', 'Swiss public broadcaster news section'),
    p('https://www.srf.ch/sport', 'SRF Sport', 'sports', 'Swiss public broadcaster sports section'),
    p('https://www.bluewin.ch', 'Blue News', 'news,sports,lifestyle', 'Swiss portal and news publisher'),
    p('https://www.nau.ch', 'Nau.ch', 'news,sports,lifestyle', 'Swiss digital news publisher'),
    p('https://www.swissinfo.ch', 'SWI swissinfo.ch', 'news,finance', 'Swiss international news publisher'),
    p('https://www.handelszeitung.ch', 'Handelszeitung', 'finance,news', 'Swiss business newspaper'),
    p('https://www.cash.ch', 'cash.ch', 'finance', 'Swiss finance and markets publisher'),
    p('https://www.finews.ch', 'finews.ch', 'finance', 'Swiss finance industry publisher'),
    p('https://www.sport.ch', 'sport.ch', 'sports', 'Swiss sports publisher'),
    p('https://www.computerworld.ch', 'Computerworld Schweiz', 'tech', 'Swiss technology publisher'),
    p('https://www.netzwoche.ch', 'Netzwoche', 'tech', 'Swiss ICT publisher'),
    p('https://www.pctipp.ch', 'PCtipp', 'tech', 'Swiss consumer technology publisher'),
    p('https://www.auto-illustrierte.ch', 'Auto-Illustrierte', 'automotive', 'Swiss automotive magazine'),
    p('https://automobilrevue.ch', 'Automobil Revue', 'automotive', 'Swiss automotive publisher'),
    p('https://www.schweizer-illustrierte.ch', 'Schweizer Illustrierte', 'lifestyle', 'Swiss lifestyle and celebrity magazine'),
    p('https://www.annabelle.ch', 'Annabelle', 'lifestyle', 'Swiss lifestyle magazine'),
    p('https://www.schweizerfamilie.ch', 'Schweizer Familie', 'lifestyle,travel,cooking', 'Swiss family and lifestyle magazine'),
    p('https://fooby.ch', 'FOOBY', 'cooking', 'Swiss food and recipe publisher'),
    p('https://www.bettybossi.ch', 'Betty Bossi', 'cooking', 'Swiss food and recipe publisher'),
    p('https://www.swissmilk.ch', 'Swissmilk', 'cooking,lifestyle', 'Swiss recipe and nutrition publisher'),
    p('https://www.travelnews.ch', 'Travelnews', 'travel', 'Swiss travel trade and consumer publisher'),
    p('https://www.abouttravel.ch', 'About Travel', 'travel', 'Swiss travel publisher'),
    p('https://www.travelinside.ch', 'Travel Inside', 'travel', 'Swiss travel industry publisher'),
  ],
  'United Kingdom': [
    p('https://www.bbc.co.uk/news', 'BBC News', 'news', 'UK public broadcaster news section'),
    p('https://www.theguardian.com', 'The Guardian', 'news,sports,lifestyle,travel', 'UK national news publisher'),
    p('https://www.telegraph.co.uk', 'The Telegraph', 'news,finance,sports,lifestyle', 'UK national newspaper'),
    p('https://www.independent.co.uk', 'The Independent', 'news,lifestyle,travel', 'UK national news publisher'),
    p('https://www.dailymail.co.uk', 'Daily Mail', 'news,lifestyle,sports', 'Large UK newspaper website'),
    p('https://www.thesun.co.uk', 'The Sun', 'news,sports,lifestyle', 'Large UK tabloid publisher'),
    p('https://www.mirror.co.uk', 'Mirror', 'news,sports,lifestyle', 'UK national newspaper site'),
    p('https://www.standard.co.uk', 'Evening Standard', 'news,lifestyle', 'London news and lifestyle publisher'),
    p('https://www.express.co.uk', 'Daily Express', 'news,lifestyle', 'UK national news publisher'),
    p('https://www.ft.com', 'Financial Times', 'finance,news', 'UK-based global financial newspaper'),
    p('https://www.cityam.com', 'City A.M.', 'finance,news', 'London business and finance publisher'),
    p('https://www.thisismoney.co.uk', 'This is Money', 'finance', 'UK personal finance publisher'),
    p('https://moneyweek.com', 'MoneyWeek', 'finance', 'UK investment and personal finance publisher'),
    p('https://www.bbc.co.uk/sport', 'BBC Sport', 'sports', 'UK public broadcaster sports section'),
    p('https://www.skysports.com', 'Sky Sports', 'sports', 'UK sports broadcaster site'),
    p('https://talksport.com', 'talkSPORT', 'sports', 'UK sports publisher and broadcaster'),
    p('https://www.football365.com', 'Football365', 'sports', 'UK football publisher'),
    p('https://www.planetf1.com', 'PlanetF1', 'sports,automotive', 'UK Formula 1 publisher'),
    p('https://www.techradar.com', 'TechRadar', 'tech', 'UK technology reviews and news site'),
    p('https://www.theregister.com', 'The Register', 'tech', 'UK technology news publisher'),
    p('https://www.wired.co.uk', 'WIRED UK', 'tech,lifestyle', 'UK technology and culture publisher'),
    p('https://www.t3.com', 'T3', 'tech,lifestyle', 'UK technology and lifestyle publisher'),
    p('https://www.autoexpress.co.uk', 'Auto Express', 'automotive', 'UK automotive publisher'),
    p('https://www.autocar.co.uk', 'Autocar', 'automotive', 'UK automotive publisher'),
    p('https://www.carmagazine.co.uk', 'CAR Magazine', 'automotive', 'UK automotive magazine'),
    p('https://www.goodhousekeeping.com/uk', 'Good Housekeeping UK', 'lifestyle,cooking', 'UK lifestyle and home publisher'),
    p('https://www.idealhome.co.uk', 'Ideal Home', 'lifestyle', 'UK home and lifestyle publisher'),
    p('https://www.bbcgoodfood.com', 'BBC Good Food', 'cooking', 'UK food and recipe publisher'),
    p('https://www.deliciousmagazine.co.uk', 'delicious. magazine', 'cooking', 'UK food publisher'),
    p('https://www.cntraveller.com', 'Condé Nast Traveller UK', 'travel,lifestyle', 'UK travel publisher'),
  ],
  France: [
    p('https://www.lemonde.fr', 'Le Monde', 'news,finance', 'French national newspaper'),
    p('https://www.lefigaro.fr', 'Le Figaro', 'news,finance,lifestyle', 'French national newspaper'),
    p('https://www.liberation.fr', 'Liberation', 'news,lifestyle', 'French national newspaper'),
    p('https://www.20minutes.fr', '20 Minutes France', 'news,sports,lifestyle', 'French daily news publisher'),
    p('https://www.franceinfo.fr', 'Franceinfo', 'news', 'French public broadcaster news site'),
    p('https://www.ouest-france.fr', 'Ouest-France', 'news,sports,lifestyle', 'Large French regional newspaper'),
    p('https://www.leparisien.fr', 'Le Parisien', 'news,sports,lifestyle', 'French daily newspaper'),
    p('https://www.bfmtv.com', 'BFMTV', 'news,finance', 'French news broadcaster site'),
    p('https://www.lexpress.fr', 'L Express', 'news,finance,lifestyle', 'French news magazine'),
    p('https://www.lesechos.fr', 'Les Echos', 'finance,news', 'French business newspaper'),
    p('https://www.latribune.fr', 'La Tribune', 'finance,news', 'French business publisher'),
    p('https://www.capital.fr', 'Capital', 'finance,lifestyle', 'French business and personal finance publisher'),
    p('https://www.boursorama.com', 'Boursorama', 'finance', 'French finance and markets portal'),
    p('https://www.lequipe.fr', 'L Equipe', 'sports', 'French sports publisher'),
    p('https://rmcsport.bfmtv.com', 'RMC Sport', 'sports', 'French sports publisher'),
    p('https://www.eurosport.fr', 'Eurosport France', 'sports', 'French sports publisher'),
    p('https://www.sofoot.com', 'So Foot', 'sports', 'French football publisher'),
    p('https://www.footmercato.net', 'Foot Mercato', 'sports', 'French football publisher'),
    p('https://www.clubic.com', 'Clubic', 'tech', 'French technology publisher'),
    p('https://www.numerama.com', 'Numerama', 'tech', 'French digital culture and tech publisher'),
    p('https://www.01net.com', '01net', 'tech', 'French consumer technology publisher'),
    p('https://www.lesnumeriques.com', 'Les Numeriques', 'tech', 'French technology reviews publisher'),
    p('https://www.auto-moto.com', 'Auto Moto', 'automotive', 'French automotive publisher'),
    p('https://www.largus.fr', 'L Argus', 'automotive', 'French automotive publisher'),
    p('https://www.automobile-magazine.fr', 'L Automobile Magazine', 'automotive', 'French automotive magazine'),
    p('https://www.marieclaire.fr', 'Marie Claire France', 'lifestyle', 'French lifestyle magazine'),
    p('https://www.elle.fr', 'ELLE France', 'lifestyle', 'French lifestyle magazine'),
    p('https://www.marmiton.org', 'Marmiton', 'cooking', 'French recipe publisher'),
    p('https://www.cuisineaz.com', 'CuisineAZ', 'cooking', 'French recipe publisher'),
    p('https://www.routard.com', 'Routard', 'travel', 'French travel publisher'),
  ],
  Italy: [
    p('https://www.repubblica.it', 'La Repubblica', 'news,lifestyle', 'Italian national newspaper'),
    p('https://www.corriere.it', 'Corriere della Sera', 'news,finance,lifestyle', 'Italian national newspaper'),
    p('https://www.ansa.it', 'ANSA', 'news', 'Italian national news agency'),
    p('https://www.ilsole24ore.com', 'Il Sole 24 Ore', 'finance,news', 'Italian business newspaper'),
    p('https://www.lastampa.it', 'La Stampa', 'news,lifestyle', 'Italian national newspaper'),
    p('https://www.ilmessaggero.it', 'Il Messaggero', 'news,sports,lifestyle', 'Italian daily newspaper'),
    p('https://www.ilfattoquotidiano.it', 'Il Fatto Quotidiano', 'news', 'Italian news publisher'),
    p('https://www.fanpage.it', 'Fanpage.it', 'news,lifestyle', 'Italian digital news publisher'),
    p('https://www.today.it', 'Today', 'news,lifestyle', 'Italian digital news publisher'),
    p('https://tg24.sky.it', 'Sky TG24', 'news', 'Italian news broadcaster site'),
    p('https://www.gazzetta.it', 'La Gazzetta dello Sport', 'sports', 'Italian sports publisher'),
    p('https://www.corrieredellosport.it', 'Corriere dello Sport', 'sports', 'Italian sports publisher'),
    p('https://www.tuttosport.com', 'Tuttosport', 'sports', 'Italian sports publisher'),
    p('https://sport.sky.it', 'Sky Sport Italia', 'sports', 'Italian sports broadcaster site'),
    p('https://www.calciomercato.com', 'Calciomercato.com', 'sports', 'Italian football publisher'),
    p('https://www.wired.it', 'WIRED Italia', 'tech,lifestyle', 'Italian technology and culture publisher'),
    p('https://www.hdblog.it', 'HDblog', 'tech', 'Italian technology publisher'),
    p('https://www.dday.it', 'DDay.it', 'tech', 'Italian technology publisher'),
    p('https://www.tomshw.it', 'Tom s Hardware Italia', 'tech', 'Italian technology publisher'),
    p('https://www.quattroruote.it', 'Quattroruote', 'automotive', 'Italian automotive publisher'),
    p('https://www.alvolante.it', 'AlVolante', 'automotive', 'Italian automotive publisher'),
    p('https://www.motorionline.com', 'Motorionline', 'automotive', 'Italian automotive publisher'),
    p('https://www.vanityfair.it', 'Vanity Fair Italia', 'lifestyle', 'Italian lifestyle magazine'),
    p('https://www.donnamoderna.com', 'Donna Moderna', 'lifestyle,cooking', 'Italian lifestyle magazine'),
    p('https://www.grazia.it', 'Grazia Italia', 'lifestyle', 'Italian lifestyle magazine'),
    p('https://www.giallozafferano.it', 'GialloZafferano', 'cooking', 'Italian recipe publisher'),
    p('https://www.lacucinaitaliana.it', 'La Cucina Italiana', 'cooking,lifestyle', 'Italian food publisher'),
    p('https://www.cookist.it', 'Cookist', 'cooking', 'Italian food publisher'),
    p('https://www.siviaggia.it', 'SiViaggia', 'travel', 'Italian travel publisher'),
    p('https://www.touringclub.it', 'Touring Club Italiano', 'travel', 'Italian travel publisher'),
  ],
  Spain: [
    p('https://elpais.com', 'El Pais', 'news,finance,lifestyle', 'Spanish national newspaper'),
    p('https://www.elmundo.es', 'El Mundo', 'news,sports,lifestyle', 'Spanish national newspaper'),
    p('https://www.abc.es', 'ABC', 'news,lifestyle', 'Spanish national newspaper'),
    p('https://www.lavanguardia.com', 'La Vanguardia', 'news,sports,lifestyle', 'Spanish newspaper'),
    p('https://www.elconfidencial.com', 'El Confidencial', 'news,finance', 'Spanish digital news publisher'),
    p('https://www.20minutos.es', '20 Minutos Spain', 'news,sports,lifestyle', 'Spanish daily news publisher'),
    p('https://www.eldiario.es', 'elDiario.es', 'news', 'Spanish digital news publisher'),
    p('https://www.elespanol.com', 'El Espanol', 'news,finance,lifestyle', 'Spanish digital news publisher'),
    p('https://www.publico.es', 'Publico', 'news', 'Spanish news publisher'),
    p('https://www.expansion.com', 'Expansion', 'finance,news', 'Spanish business newspaper'),
    p('https://cincodias.elpais.com', 'Cinco Dias', 'finance,news', 'Spanish business publisher'),
    p('https://www.eleconomista.es', 'El Economista', 'finance,news', 'Spanish business publisher'),
    p('https://www.marca.com', 'Marca', 'sports', 'Spanish sports publisher'),
    p('https://as.com', 'AS', 'sports', 'Spanish sports publisher'),
    p('https://www.mundodeportivo.com', 'Mundo Deportivo', 'sports', 'Spanish sports publisher'),
    p('https://www.sport.es', 'Sport', 'sports', 'Spanish sports publisher'),
    p('https://www.xataka.com', 'Xataka', 'tech', 'Spanish technology publisher'),
    p('https://www.genbeta.com', 'Genbeta', 'tech', 'Spanish technology publisher'),
    p('https://computerhoy.20minutos.es', 'Computer Hoy', 'tech', 'Spanish consumer technology publisher'),
    p('https://hipertextual.com', 'Hipertextual', 'tech', 'Spanish technology and culture publisher'),
    p('https://www.motorpasion.com', 'Motorpasion', 'automotive', 'Spanish automotive publisher'),
    p('https://www.autobild.es', 'Auto Bild Espana', 'automotive', 'Spanish automotive publisher'),
    p('https://www.telva.com', 'Telva', 'lifestyle', 'Spanish lifestyle magazine'),
    p('https://www.hola.com', 'Hola', 'lifestyle', 'Spanish celebrity and lifestyle publisher'),
    p('https://www.elle.com/es', 'ELLE Espana', 'lifestyle', 'Spanish lifestyle magazine'),
    p('https://www.directoalpaladar.com', 'Directo al Paladar', 'cooking', 'Spanish food publisher'),
    p('https://www.pequerecetas.com', 'Pequerecetas', 'cooking', 'Spanish recipe publisher'),
    p('https://www.traveler.es', 'Condé Nast Traveler Spain', 'travel,lifestyle', 'Spanish travel publisher'),
    p('https://viajes.nationalgeographic.com.es', 'National Geographic Viajes', 'travel', 'Spanish travel publisher'),
    p('https://www.hosteltur.com', 'Hosteltur', 'travel', 'Spanish travel industry publisher'),
  ],
  Netherlands: [
    p('https://www.telegraaf.nl', 'De Telegraaf', 'news,sports,lifestyle', 'Dutch national newspaper'),
    p('https://www.nu.nl', 'NU.nl', 'news,sports,lifestyle', 'Large Dutch news publisher'),
    p('https://www.volkskrant.nl', 'de Volkskrant', 'news,lifestyle', 'Dutch national newspaper'),
    p('https://www.nrc.nl', 'NRC', 'news,finance,lifestyle', 'Dutch national newspaper'),
    p('https://www.trouw.nl', 'Trouw', 'news,lifestyle', 'Dutch national newspaper'),
    p('https://www.ad.nl', 'Algemeen Dagblad', 'news,sports,lifestyle', 'Dutch national newspaper'),
    p('https://www.parool.nl', 'Het Parool', 'news,lifestyle', 'Amsterdam news publisher'),
    p('https://nos.nl', 'NOS', 'news,sports', 'Dutch public broadcaster news site'),
    p('https://www.rtlnieuws.nl', 'RTL Nieuws', 'news,lifestyle', 'Dutch news broadcaster site'),
    p('https://www.bnr.nl', 'BNR', 'finance,news', 'Dutch business news publisher'),
    p('https://fd.nl', 'Het Financieele Dagblad', 'finance,news', 'Dutch business newspaper'),
    p('https://www.iex.nl', 'IEX', 'finance', 'Dutch investing and markets publisher'),
    p('https://www.belegger.nl', 'Belegger.nl', 'finance', 'Dutch investing publisher'),
    p('https://www.vi.nl', 'Voetbal International', 'sports', 'Dutch football publisher'),
    p('https://www.voetbalprimeur.nl', 'VoetbalPrimeur', 'sports', 'Dutch football publisher'),
    p('https://www.tweakers.net', 'Tweakers', 'tech', 'Dutch technology publisher'),
    p('https://www.bright.nl', 'Bright', 'tech,lifestyle', 'Dutch technology and lifestyle publisher'),
    p('https://www.computable.nl', 'Computable', 'tech', 'Dutch business technology publisher'),
    p('https://www.autoweek.nl', 'AutoWeek Nederland', 'automotive', 'Dutch automotive publisher'),
    p('https://www.autoblog.nl', 'Autoblog.nl', 'automotive', 'Dutch automotive publisher'),
    p('https://topgear.nl', 'TopGear Nederland', 'automotive', 'Dutch automotive publisher'),
    p('https://www.libelle.nl', 'Libelle', 'lifestyle,cooking', 'Dutch lifestyle magazine'),
    p('https://www.linda.nl', 'LINDA.', 'lifestyle', 'Dutch lifestyle publisher'),
    p('https://www.vtwonen.nl', 'vtwonen', 'lifestyle', 'Dutch home and lifestyle publisher'),
    p('https://www.24kitchen.nl', '24Kitchen', 'cooking', 'Dutch food publisher'),
    p('https://www.culy.nl', 'Culy', 'cooking', 'Dutch food publisher'),
    p('https://www.deliciousmagazine.nl', 'delicious. Nederland', 'cooking', 'Dutch food publisher'),
    p('https://www.anwb.nl/vakantie', 'ANWB Vakantie', 'travel', 'Dutch travel publisher'),
    p('https://www.reisjunk.nl', 'Reisjunk', 'travel', 'Dutch travel publisher'),
    p('https://www.travmagazine.nl', 'TravMagazine', 'travel', 'Dutch travel publisher'),
  ],
  Poland: [
    p('https://www.wp.pl', 'Wirtualna Polska', 'news,sports,lifestyle,finance', 'Large Polish portal and publisher'),
    p('https://www.onet.pl', 'Onet', 'news,sports,lifestyle,travel', 'Large Polish portal and publisher'),
    p('https://www.gazeta.pl', 'Gazeta.pl', 'news,lifestyle', 'Polish digital news publisher'),
    p('https://tvn24.pl', 'TVN24', 'news', 'Polish news broadcaster site'),
    p('https://www.polsatnews.pl', 'Polsat News', 'news', 'Polish news broadcaster site'),
    p('https://www.rp.pl', 'Rzeczpospolita', 'news,finance', 'Polish national newspaper'),
    p('https://wyborcza.pl', 'Gazeta Wyborcza', 'news,lifestyle', 'Polish national newspaper'),
    p('https://www.interia.pl', 'Interia', 'news,sports,lifestyle', 'Large Polish portal and publisher'),
    p('https://www.se.pl', 'Super Express', 'news,sports,lifestyle', 'Polish tabloid news publisher'),
    p('https://www.fakt.pl', 'Fakt', 'news,lifestyle', 'Polish tabloid news publisher'),
    p('https://www.pb.pl', 'Puls Biznesu', 'finance,news', 'Polish business newspaper'),
    p('https://www.money.pl', 'Money.pl', 'finance', 'Polish finance publisher'),
    p('https://www.bankier.pl', 'Bankier.pl', 'finance', 'Polish finance and markets publisher'),
    p('https://businessinsider.com.pl', 'Business Insider Polska', 'finance,news', 'Polish business publisher'),
    p('https://www.sport.pl', 'Sport.pl', 'sports', 'Polish sports publisher'),
    p('https://przegladsportowy.onet.pl', 'Przeglad Sportowy', 'sports', 'Polish sports publisher'),
    p('https://sportowefakty.wp.pl', 'SportoweFakty', 'sports', 'Polish sports publisher'),
    p('https://eurosport.tvn24.pl', 'Eurosport Polska', 'sports', 'Polish sports publisher'),
    p('https://spidersweb.pl', 'Spider s Web', 'tech', 'Polish technology publisher'),
    p('https://www.benchmark.pl', 'Benchmark.pl', 'tech', 'Polish technology publisher'),
    p('https://www.komputerswiat.pl', 'Komputer Swiat', 'tech', 'Polish consumer technology publisher'),
    p('https://www.dobreprogramy.pl', 'Dobreprogramy', 'tech', 'Polish technology publisher'),
    p('https://autokult.pl', 'Autokult', 'automotive', 'Polish automotive publisher'),
    p('https://motofakty.pl', 'Motofakty', 'automotive', 'Polish automotive publisher'),
    p('https://www.auto-swiat.pl', 'Auto Swiat', 'automotive', 'Polish automotive publisher'),
    p('https://kobieta.wp.pl', 'Kobieta WP', 'lifestyle', 'Polish lifestyle publisher'),
    p('https://www.elle.pl', 'ELLE Polska', 'lifestyle', 'Polish lifestyle magazine'),
    p('https://styl.interia.pl', 'Styl.pl', 'lifestyle,cooking', 'Polish lifestyle publisher'),
    p('https://www.kwestiasmaku.com', 'Kwestia Smaku', 'cooking', 'Polish recipe publisher'),
    p('https://www.mojegotowanie.pl', 'Moje Gotowanie', 'cooking', 'Polish food publisher'),
  ],
};

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function getTopicTokens(topic) {
  const tokens = normalize(topic).split(/[^a-z0-9]+/).filter(Boolean);
  const expanded = [...tokens];

  for (const token of tokens) {
    for (const [canonical, aliases] of Object.entries(TOPIC_ALIASES)) {
      if (canonical === token || aliases.includes(token)) {
        expanded.push(canonical, ...aliases);
      }
    }
  }

  return unique(expanded);
}

function getTopicScore(publisher, topicTokens) {
  if (topicTokens.length === 0) return 0;
  const topics = publisher.topics || [];
  const haystack = `${publisher.url} ${publisher.name} ${publisher.reason || ''}`.toLowerCase();

  let score = 0;
  for (const token of topicTokens) {
    if (topics.includes(token)) score += 20;
    if (haystack.includes(token)) score += 5;
  }
  if (topics.includes('news')) score += 2;

  return score;
}

function withReason(publisher, country) {
  return {
    url: publisher.url,
    name: publisher.name,
    reason: publisher.reason || `Curated ${country} publisher with standard display inventory potential`,
  };
}

function sortForTopic(items, topic) {
  const topicTokens = getTopicTokens(topic);
  return [...items]
    .map((publisher, index) => ({
      publisher,
      index,
      score: getTopicScore(publisher, topicTokens),
    }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((entry) => entry.publisher);
}

/**
 * Get fallback publisher suggestions for a given topic and country.
 */
function getFallbackPublishers(topic, country, limit = 24) {
  const maxResults = Math.max(1, Math.min(Number.parseInt(limit, 10) || 24, 30));
  const effectiveCountry = PUBLISHER_CORPUS[country] ? country : 'Germany';
  const countryPublishers = PUBLISHER_CORPUS[effectiveCountry];
  const ranked = sortForTopic(countryPublishers, topic);

  return ranked.slice(0, maxResults).map((publisher) => withReason(publisher, effectiveCountry));
}

module.exports = {
  getFallbackPublishers,
  FALLBACK_DATA: PUBLISHER_CORPUS,
  PUBLISHER_CORPUS,
};
