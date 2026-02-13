import { useState, useRef } from 'react';
import { Search, Upload, Code, X, ChevronDown, Link } from 'lucide-react';
import axios from 'axios';
import DeviceToggle from './DeviceToggle';
import AdSizeSelector from './AdSizeSelector';
import WebsiteSuggestions from './WebsiteSuggestions';

const TOPICS = [
  'Sports', 'Finance', 'News', 'Tech', 'Automotive',
  'Lifestyle', 'Cooking', 'Travel',
];

const COUNTRIES = [
  'Germany', 'Austria', 'Switzerland', 'United Kingdom',
  'France', 'Italy', 'Spain', 'Netherlands', 'Poland',
];

export default function InputPanel({ onResult, onGenerating, onProgress, onError }) {
  const [topic, setTopic] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [country, setCountry] = useState('');
  const [device, setDevice] = useState('desktop');
  const [adSize, setAdSize] = useState('300x250');
  const [adInputMode, setAdInputMode] = useState('image'); // 'tag' or 'image'
  const [adTag, setAdTag] = useState('');
  const [adImage, setAdImage] = useState(null);
  const [adImagePreview, setAdImagePreview] = useState(null);
  const [overrideUrl, setOverrideUrl] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(null);
  const [selectedUrl, setSelectedUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef(null);

  const effectiveTopic = topic === 'custom' ? customTopic : topic;

  // Reset ad size when device changes
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

  const fetchSuggestions = async () => {
    if (!effectiveTopic || !country) return;

    setSuggestionsLoading(true);
    setSuggestionsError(null);
    setSuggestions(null);
    setSelectedUrl('');

    try {
      const res = await axios.post('/api/suggest-websites', {
        topic: effectiveTopic,
        country,
      });
      setSuggestions(res.data.suggestions);
    } catch (err) {
      setSuggestionsError(
        err.response?.data?.error || 'Failed to fetch suggestions. Using fallback...'
      );
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    onError(null);

    const websiteUrl = overrideUrl || selectedUrl;
    if (!websiteUrl) {
      onError('Please select a website or enter a URL');
      return;
    }
    if (!adTag && !adImage) {
      onError('Please provide an ad tag or upload an ad image');
      return;
    }

    setIsSubmitting(true);
    onGenerating(true);
    onProgress('Selecting website...');
    onResult(null);

    try {
      const formData = new FormData();
      formData.append('websiteUrl', websiteUrl);
      formData.append('adSize', adSize);
      formData.append('device', device);

      if (adTag) {
        formData.append('adTag', adTag);
      }
      if (adImage) {
        formData.append('adImage', adImage);
      }

      const res = await axios.post('/api/generate-mockup', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000, // 2 minute timeout
        onUploadProgress: () => {
          onProgress('Loading page...');
        },
      });

      onResult(res.data);
      onProgress('');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to generate mockup. Please try again.';
      onError(msg);
    } finally {
      setIsSubmitting(false);
      onGenerating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-text-primary">New Mockup</h1>
        <p className="text-xs text-text-muted mt-0.5">
          Visualize ad placements on real publisher sites
        </p>
      </div>

      <hr className="border-gray-100" />

      {/* Topic */}
      <div>
        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
          Topic / Vertical
        </label>
        <div className="relative">
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
          >
            <option value="">Select a topic...</option>
            {TOPICS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
            <option value="custom">Other (type below)</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>
        {topic === 'custom' && (
          <input
            type="text"
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            placeholder="e.g. Real Estate, Gaming, Health..."
            className="mt-2 w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
          />
        )}
      </div>

      {/* Country */}
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
            {COUNTRIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>
      </div>

      {/* Suggest Websites Button */}
      {effectiveTopic && country && (
        <button
          type="button"
          onClick={fetchSuggestions}
          disabled={suggestionsLoading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-navy text-navy text-sm font-medium hover:bg-navy hover:text-white transition-all disabled:opacity-50"
        >
          <Search size={15} />
          {suggestionsLoading ? 'Finding websites...' : 'Find publisher websites'}
        </button>
      )}

      {/* Website Suggestions */}
      <WebsiteSuggestions
        suggestions={suggestions}
        loading={suggestionsLoading}
        error={suggestionsError}
        selectedUrl={selectedUrl}
        onSelect={setSelectedUrl}
      />

      {/* Override URL */}
      <div>
        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
          <span className="flex items-center gap-1">
            <Link size={12} />
            Specific Website URL
            <span className="font-normal normal-case">(optional override)</span>
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

      <hr className="border-gray-100" />

      {/* Device Toggle */}
      <DeviceToggle value={device} onChange={handleDeviceChange} />

      {/* Ad Size */}
      <AdSizeSelector device={device} value={adSize} onChange={setAdSize} />

      <hr className="border-gray-100" />

      {/* Ad Creative */}
      <div>
        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          Ad Creative
        </label>

        {/* Mode toggle */}
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
                  {adImage?.name} — Dimensions must match {adSize}
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

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting || (!overrideUrl && !selectedUrl)}
        className="w-full py-3 rounded-lg bg-accent text-white font-semibold text-sm hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Generating...' : 'Generate Mockup'}
      </button>
    </form>
  );
}
