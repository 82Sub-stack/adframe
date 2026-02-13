/**
 * Phone device frame wrapper for mobile mockups.
 */
export default function DeviceFrame({ children }) {
  return (
    <div className="inline-block relative">
      {/* Phone frame */}
      <div className="relative bg-[#1a1a1a] rounded-[40px] p-3 shadow-2xl">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-[#1a1a1a] rounded-b-2xl z-10 flex items-center justify-center">
          <div className="w-[60px] h-[4px] bg-[#333] rounded-full mt-1" />
        </div>

        {/* Screen area */}
        <div className="relative bg-white rounded-[28px] overflow-hidden" style={{ width: 290, maxHeight: 600 }}>
          {/* Status bar */}
          <div className="h-[28px] bg-black" />

          {/* Content */}
          <div className="overflow-hidden" style={{ maxHeight: 572 }}>
            {children}
          </div>
        </div>

        {/* Home indicator */}
        <div className="flex items-center justify-center pt-2">
          <div className="w-[100px] h-[4px] bg-[#555] rounded-full" />
        </div>
      </div>
    </div>
  );
}
