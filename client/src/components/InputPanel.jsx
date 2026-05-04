import { useState, useRef } from 'react';
import { Search, Upload, Code, X, ChevronDown, Link } from 'lucide-react';
import axios from 'axios';
import DeviceToggle from './DeviceToggle';
import AdSizeSelector from './AdSizeSelector';
import WebsiteSuggestions from './WebsiteSuggestions';

const COUNTRIES = [
  'Germany', 'Austria', 'Switzerland', 'United Kingdom',
  'France', 'Italy', 'Spain', 'Netherlands', 'Poland',
];

const PROGRESS_STEPS = [
  'Loading page...',
  'Handling consent banners...',
  'Scrolling page...',
  'Detecting ad positions...',
  'Taking screenshot...',
  'Generating mockup...',
];

const SUGGESTION_LIMIT = 12;
const MAX_SELECTED_URLS = 5;
const MOCKUP_COUNT_OPTIONS = [1, 2, 3, 5];

function getSuggestionScore(site) {
  return site?.preflight?.score ?? 0;
}

function getRankedViableUrls(suggestions = []) {
  return [...suggestions]
    .filter((site) => site?.url && site.preflight?.status !== 'failed')
    .sort((a, b) => getSuggestionScore(b) - getSuggestionScore(a))
    .map((site) => site.url);
}

export default function InputPanel({ onResult, onGenerating, onProgress, onError }) {
  const [topic, setTopic] = useState('');
  const [country, setCountry] = useState('');
  const [device, setDevice] = useState('desktop');
  const [adSize, setAdSize] = useState('300x250');
  const [adInputMode, setAdInputMode] = useState('image'); // 'tag' or 'image'
  const [adTag, setAdTag] = useState('');
  const [adImage, setAdImage] = useState(null);
  const [adImagePreview, setAdImagePreview] = useState(null);
  const [allowHeuristicFallback, setAllowHeuristicFallback] = useState(false);
  const [alwaysShowSlotPicker, setAlwaysShowSlotPicker] = useState(false);
  const [mockupCount, setMockupCount] = useState(2);
  const [overrideUrl, setOverrideUrl] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(null);
  const [selectedUrls, setSelectedUrls] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef(null);
  const progressTimerRef = useRef(null);

  const handleDeviceChange = (newDevice) => {
    setDevice(newDevice);
    const desktopOnly = ['728x90', '160x600', '970x250'];
    if (newDevice === 'mobile' && desktopOnly.includes(adSize)) {
      setAdSize('300x250');
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      setAdImagePreview(ev.target.result);
    };
    reader.readAsDataURL(file);
    setAdImage(file);
  };

  const clearImage = () => {
    setAdImage(null);
    setAdImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleSuggestedUrl = (url) => {
    setSelectedUrls((prev) => {
      if (prev.includes(url)) {
        return prev.filter((entry) => entry !== url);
      }
      if (prev.length >= MAX_SELECTED_URLS) {
        return [...prev.slice(1), url];
      }
      return [...prev, url];
    });
  };

  const fetchSuggestions = async () => {
    const cleanedTopic = topic.trim();
    if (!cleanedTopic || !country) return;

    setSuggestionsLoading(true);
    setSuggestionsError(null);
    setSuggestions(null);
    setSelectedUrls([]);

    try {
      const res = await axios.post('/api/suggest-websites', {
        topic: cleanedTopic,
        country,
        adSize,
        device,
        limit: SUGGESTION_LIMIT,
      });
      const rankedSuggestions = res.data.suggestions || [];
      setSuggestions(rankedSuggestions);
      setSelectedUrls(getRankedViableUrls(rankedSuggestions).slice(0, mockupCount));
    } catch (err) {
      setSuggestionsError(
        err.response?.data?.error || 'Failed to fetch suggestions. Using fallback...'
      );
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const buildTargetUrls = () => {
    const desiredCount = mockupCount;
    const candidates = [];
    const addCandidate = (url) => {
      if (url && !candidates.includes(url)) {
        candidates.push(url);
      }
    };

    const customUrl = overrideUrl.trim();
    if (customUrl) {
      addCandidate(customUrl);
    }

    for (const url of selectedUrls) {
      addCandidate(url);
    }

    for (const url of getRankedViableUrls(suggestions || [])) {
      addCandidate(url);
    }

    if (candidates.length === 0) {
      return { error: 'Please select ranked website suggestions or enter a specific URL' };
    }

    if (candidates.length < desiredCount) {
      return {
        error: `Only ${candidates.length} viable website${candidates.length === 1 ? '' : 's'} available. Reduce the output count or add a custom URL.`,
      };
    }

    return {
      desiredCount,
      urls: candidates.slice(0, Math.min(candidates.length, desiredCount + 4)),
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    onError(null);

    const cleanedTopic = topic.trim();
    if (!cleanedTopic) {
      onError('Please enter a topic to match relevant site sections');
      return;
    }

    if (!adTag && !adImage) {
      onError('Please provide an ad tag or upload an ad image');
      return;
    }

    const target = buildTargetUrls();
    if (target.error) {
      onError(target.error);
      return;
    }

    const urls = target.urls;
    const desiredCount = target.desiredCount;
    setIsSubmitting(true);
    onGenerating(true);
    onProgress('Generating mockups...');
    onResult(null);

    const results = [];
    const failures = [];

    try {
      for (let index = 0; index < urls.length && results.length < desiredCount; index++) {
        const websiteUrl = urls[index];
        let progressIndex = 0;
        onProgress(`Generating mockup ${results.length + 1}/${desiredCount} from candidate ${index + 1}/${urls.length}... ${PROGRESS_STEPS[progressIndex]}`);

        const formData = new FormData();
        formData.append('websiteUrl', websiteUrl);
        formData.append('topic', cleanedTopic);
        formData.append('adSize', adSize);
        formData.append('device', device);
        formData.append('allowHeuristicFallback', String(allowHeuristicFallback));

        if (adTag) {
          formData.append('adTag', adTag);
        }
        if (adImage) {
          formData.append('adImage', adImage);
        }

        progressTimerRef.current = setInterval(() => {
          progressIndex = Math.min(progressIndex + 1, PROGRESS_STEPS.length - 1);
          onProgress(`Generating mockup ${results.length + 1}/${desiredCount} from candidate ${index + 1}/${urls.length}... ${PROGRESS_STEPS[progressIndex]}`);
        }, 2500);

        try {
          const res = await axios.post('/api/generate-mockup', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 240000,
          });

          results.push({
            ...res.data,
            clientOptions: {
              alwaysShowSlotPicker,
            },
          });
        } catch (err) {
          failures.push({
            failed: true,
            websiteUrl,
            error: err.response?.data?.error || 'Failed to generate this candidate.',
          });
        }

        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
      }

      if (results.length === 0) {
        onError(failures[0]?.error || 'No mockups could be generated from the ranked candidates.');
        return;
      }

      onResult([...results, ...failures]);
      onProgress('');
    } catch (err) {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      const msg = err.response?.data?.error || 'Failed to generate mockup. Please try again.';
      onError(msg);
    } finally {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setIsSubmitting(false);
      onGenerating(false);
    }
  };

  const hasAnyUrl =
    overrideUrl.trim().length > 0 ||
    selectedUrls.length > 0 ||
    getRankedViableUrls(suggestions || []).length > 0;

  return (
    <form onSubmit={handleSubmit} className="p-5 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">New Mockup</h1>
        <p className="text-xs text-text-muted mt-0.5">
          Visualize ad placements on real publisher sites
        </p>
      </div>

      <hr className="border-gray-100" />

      <div>
        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
          Topic / Vertical
        </label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. sports, soccer, ai security, gaming laptops"
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
        />
        <p className="text-xs text-text-muted mt-1">
          Used to target matching subdomains/sections (for example, sports pages on news sites).
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
          Country
        </label>
        <div className="relative">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
          >
            <option value="">Select a country...</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>
      </div>

      {topic.trim() && country && (
        <button
          type="button"
          onClick={fetchSuggestions}
          disabled={suggestionsLoading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-navy text-navy text-sm font-medium hover:bg-navy hover:text-white transition-all disabled:opacity-50"
        >
          <Search size={15} />
          {suggestionsLoading ? 'Scoring websites...' : 'Find & rank publisher websites'}
        </button>
      )}

      <WebsiteSuggestions
        suggestions={suggestions}
        loading={suggestionsLoading}
        error={suggestionsError}
        selectedUrls={selectedUrls}
        onToggle={toggleSuggestedUrl}
      />

      <div>
        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
          <span className="flex items-center gap-1">
            <Link size={12} />
            Specific Website URL
            <span className="font-normal normal-case">(optional, can be combined with suggestions)</span>
          </span>
        </label>
        <input
          type="text"
          value={overrideUrl}
          onChange={(e) => setOverrideUrl(e.target.value)}
          placeholder="https://www.example.com"
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          Output
        </label>
        <div className="grid grid-cols-4 gap-2">
          {MOCKUP_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => setMockupCount(count)}
              className={`py-2 rounded-lg border text-sm font-medium ${
                mockupCount === count
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-gray-200 text-text-primary hover:bg-gray-50'
              }`}
            >
              {count}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-1">
          Ranked alternates are tried automatically until the requested count is reached.
        </p>
      </div>

      <hr className="border-gray-100" />

      <DeviceToggle value={device} onChange={handleDeviceChange} />

      <AdSizeSelector device={device} value={adSize} onChange={setAdSize} />

      <hr className="border-gray-100" />

      <div>
        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          Ad Creative
        </label>

        <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-3">
          <button
            type="button"
            onClick={() => setAdInputMode('image')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-all ${
              adInputMode === 'image'
                ? 'bg-navy text-white'
                : 'bg-white text-text-primary hover:bg-gray-50'
            }`}
          >
            <Upload size={13} />
            Image Upload
          </button>
          <button
            type="button"
            onClick={() => setAdInputMode('tag')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-all border-l border-gray-200 ${
              adInputMode === 'tag'
                ? 'bg-navy text-white'
                : 'bg-white text-text-primary hover:bg-gray-50'
            }`}
          >
            <Code size={13} />
            Ad Tag
          </button>
        </div>

        {adInputMode === 'image' ? (
          <div>
            {adImagePreview ? (
              <div className="relative">
                <img
                  src={adImagePreview}
                  alt="Ad preview"
                  className="w-full rounded-lg border border-gray-200"
                  style={{ maxHeight: 200, objectFit: 'contain' }}
                />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                >
                  <X size={12} />
                </button>
                <div className="mt-1.5 text-xs text-text-muted">
                  {adImage?.name} - Dimensions must match {adSize}
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 py-6 rounded-lg border-2 border-dashed border-gray-200 cursor-pointer hover:border-accent/40 hover:bg-accent/5 transition-all">
                <Upload size={20} className="text-text-muted" />
                <span className="text-sm text-text-muted">
                  Upload banner image ({adSize})
                </span>
                <span className="text-xs text-text-muted">JPG, PNG, or GIF</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        ) : (
          <div>
            <textarea
              value={adTag}
              onChange={(e) => setAdTag(e.target.value)}
              placeholder="Paste your ad tag here (HTML/JS snippet from your ad server)..."
              rows={5}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-xs font-mono focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 resize-y"
            />
            <p className="text-xs text-text-muted mt-1">
              Supports script tags, iframe embeds, and HTML creatives
            </p>
          </div>
        )}
      </div>

      <hr className="border-gray-100" />

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="flex items-start gap-2 text-xs text-text-primary">
          <input
            type="checkbox"
            checked={allowHeuristicFallback}
            onChange={(e) => setAllowHeuristicFallback(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Allow heuristic fallback when no reliable ad slot is found
            <span className="block text-text-muted mt-0.5">
              Disabled means generation fails instead of placing ads in potentially wrong spots.
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="flex items-start gap-2 text-xs text-text-primary">
          <input
            type="checkbox"
            checked={alwaysShowSlotPicker}
            onChange={(e) => setAlwaysShowSlotPicker(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Always show slot picker when candidates are available
            <span className="block text-text-muted mt-0.5">
              Disabled means high-confidence auto-selections open directly on the generated mockup.
            </span>
          </span>
        </label>
      </div>

      <hr className="border-gray-100" />

      <button
        type="submit"
        disabled={isSubmitting || !hasAnyUrl}
        className="w-full py-3 rounded-lg bg-accent text-white font-semibold text-sm hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSubmitting ? `Generating ${mockupCount} mockup${mockupCount > 1 ? 's' : ''}...` : `Generate ${mockupCount} Mockup${mockupCount > 1 ? 's' : ''}`}
      </button>
    </form>
  );
}
