import { Info } from 'lucide-react';
import { useState } from 'react';

const AD_SIZES = {
  desktop: [
    {
      value: '728x90',
      label: '728x90 — Leaderboard',
      name: 'Leaderboard',
      placement: 'Top of page (below navigation/header) or between content sections. Classic premium placement, often the first ad a user sees.',
    },
    {
      value: '970x250',
      label: '970x250 — Billboard',
      name: 'Billboard',
      placement: 'Top of page, spanning full content width. Premium high-impact placement, often used for branding campaigns.',
    },
    {
      value: '300x250',
      label: '300x250 — Medium Rectangle',
      name: 'Medium Rectangle',
      placement: 'In-content (between paragraphs), in-feed, sidebar. The most universal ad unit — appears on virtually every page.',
    },
    {
      value: '300x600',
      label: '300x600 — Half Page',
      name: 'Half Page',
      placement: 'Right-hand sidebar (sticky or static), between content sections. High-impact format with strong viewability.',
    },
    {
      value: '160x600',
      label: '160x600 — Wide Skyscraper',
      name: 'Wide Skyscraper',
      placement: 'Left or right sidebar, typically sticky/fixed on scroll. Common on news and content-heavy sites.',
    },
  ],
  mobile: [
    {
      value: '300x250',
      label: '300x250 — Medium Rectangle',
      name: 'Medium Rectangle',
      placement: 'Between content blocks on mobile. The most universal mobile ad unit.',
    },
    {
      value: '300x600',
      label: '300x600 — Half Page',
      name: 'Half Page',
      placement: 'Between content sections on mobile. High-impact format.',
    },
  ],
};

export default function AdSizeSelector({ device, value, onChange }) {
  const [tooltipOpen, setTooltipOpen] = useState(null);
  const sizes = AD_SIZES[device] || AD_SIZES.desktop;

  return (
    <div>
      <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
        Ad Size
      </label>
      <div className="space-y-1.5">
        {sizes.map((size) => (
          <div key={size.value} className="relative">
            <button
              type="button"
              onClick={() => onChange(size.value)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all ${
                value === size.value
                  ? 'border-accent bg-accent/5 text-accent font-medium'
                  : 'border-gray-200 hover:border-gray-300 text-text-primary'
              }`}
            >
              <span>{size.label}</span>
              <span
                className="ml-2 text-text-muted hover:text-accent cursor-help relative"
                onMouseEnter={() => setTooltipOpen(size.value)}
                onMouseLeave={() => setTooltipOpen(null)}
                onClick={(e) => e.stopPropagation()}
              >
                <Info size={14} />
                {tooltipOpen === size.value && (
                  <div className="absolute right-0 top-full mt-1 w-64 p-2.5 bg-navy text-text-light text-xs rounded-lg shadow-lg z-50 leading-relaxed">
                    <div className="font-semibold text-accent mb-1">{size.name}</div>
                    {size.placement}
                  </div>
                )}
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export { AD_SIZES };
