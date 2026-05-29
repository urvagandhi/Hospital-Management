import React, { useState } from "react";
import { createPortal } from "react-dom";
import Spinner from "./Spinner";

type PdfMode = "merged" | "per-folder";

interface PdfModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: PdfMode) => void;
  loading?: boolean;
}

const PdfModeModal: React.FC<PdfModeModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading = false,
}) => {
  const [selected, setSelected] = useState<PdfMode>("merged");

  if (!isOpen) return null;

  const options: { mode: PdfMode; title: string; subtitle: string; icon: string }[] = [
    {
      mode: "merged",
      title: "One merged PDF",
      subtitle: "All folders combined into a single PDF file with section headers",
      icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    },
    {
      mode: "per-folder",
      title: "One PDF per folder",
      subtitle: "Each folder becomes its own PDF, downloaded together as a ZIP",
      icon: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
    },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-white rounded-2xl shadow-modal ring-1 ring-neutral-200 max-w-md w-full mx-4 p-6">
        <h2 className="text-xl font-bold text-gray-900">Download as PDF</h2>
        <p className="text-sm text-gray-500 mt-1">Choose how you want to receive the files.</p>

        <div className="mt-4 space-y-3">
          {options.map((opt) => (
            <button
              key={opt.mode}
              onClick={() => setSelected(opt.mode)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                selected === opt.mode
                  ? "border-blue-600 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-start space-x-3">
                <svg
                  className={`w-6 h-6 mt-0.5 ${
                    selected === opt.mode ? "text-blue-600" : "text-gray-400"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={opt.icon}
                  />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{opt.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.subtitle}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onClose();
              onConfirm(selected);
            }}
            disabled={loading}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2"
          >
            {loading && <Spinner variant="scan" size="sm" />}
            <span>Download</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PdfModeModal;
