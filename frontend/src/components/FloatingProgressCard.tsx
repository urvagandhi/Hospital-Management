import React from "react";
import { Loader2, Settings, Download } from "lucide-react";

interface Props {
  isVisible: boolean;
  status: "preparing" | "downloading" | "uploading";
  progress?: number;
  message?: string;
  speed?: string;
  targetSizeMb?: number;
}

const FloatingProgressCard: React.FC<Props> = ({ isVisible, status, progress, message, speed, targetSizeMb }) => {
  const [duration, setDuration] = React.useState(0);

  React.useEffect(() => {
    let interval: any;
    if (isVisible && status === "preparing") {
      setDuration(0);
      interval = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } else {
      setDuration(0);
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isVisible, status]);

  if (!isVisible) return null;

  const isTakingLong = duration > 45;
  const limitText = targetSizeMb ? `${targetSizeMb}MB` : "the size";

  return (
    <div className="animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-neutral-200 p-4 min-w-[320px] max-w-[400px] flex items-start gap-4">
        <div className="relative flex-shrink-0 mt-1">
          {status === "preparing" ? (
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <Settings className="w-5 h-5 text-blue-600 animate-spin" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center relative">
              <Download className="w-5 h-5 text-green-600" />
              {progress !== undefined && progress > 0 && (
                <svg className="absolute inset-0 w-10 h-10 -rotate-90">
                  <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-green-100" />
                  <circle
                    cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="3"
                    strokeDasharray={113}
                    strokeDashoffset={113 - (113 * progress) / 100}
                    className="text-green-600 transition-all duration-300"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-neutral-900">
            {status === "preparing"
              ? "Preparing your document..."
              : status === "uploading"
                ? "Uploading..."
                : "Downloading..."}
          </p>
          <div className="text-[12px] leading-relaxed text-neutral-600 font-medium mt-1">
            {status === "preparing" && isTakingLong ? (
              <span className="text-neutral-700">
                We are optimizing your document to fit within the <span className="font-bold text-blue-600">{limitText}</span> limit. This ensures a faster experience and may take a moment longer.
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                {message || (status === "downloading" && progress !== undefined ? `${progress}% complete` : "Please wait while we process your request")}
                {speed && <span className="opacity-40">•</span>}
                {speed && <span className="text-neutral-500">{speed}</span>}
              </span>
            )}
          </div>
        </div>

        {status === "downloading" && progress !== undefined && progress >= 0 && (
          <span className="text-xs font-bold text-green-600 tabular-nums mt-1">
            {progress}%
          </span>
        )}
      </div>
    </div>
  );
};

export default FloatingProgressCard;
