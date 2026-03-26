import React, { useState, useMemo } from "react";

interface FolderInfo {
  name: string;
  size: number;
  fileCount: number;
}

interface ZipSizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedFolders: string[]) => void;
  totalSize: number;
  folders: FolderInfo[];
  loading?: boolean;
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

const ZipSizeModal: React.FC<ZipSizeModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  totalSize,
  folders,
  loading = false,
}) => {
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(folders.map((f) => [f.name, true])),
  );

  const selectedSize = useMemo(
    () => folders.filter((f) => checked[f.name]).reduce((sum, f) => sum + f.size, 0),
    [checked, folders],
  );

  const isOverLimit = selectedSize > 10 * 1024 * 1024;
  const selectedNames = folders.filter((f) => checked[f.name]).map((f) => f.name);

  const toggle = (name: string) => {
    setChecked((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6">
        <h2 className="text-xl font-bold text-gray-900">
          Download too large ({formatMB(totalSize)} MB)
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Select the folders you want to include in the download.
        </p>

        <div className="mt-4 max-h-64 overflow-y-auto space-y-2">
          {folders.map((folder) => (
            <label
              key={folder.name}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
            >
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={!!checked[folder.name]}
                  onChange={() => toggle(folder.name)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900 capitalize">
                    {folder.name}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    {folder.fileCount} file{folder.fileCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <span className="text-sm text-gray-500">{formatMB(folder.size)} MB</span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className={`text-sm font-medium ${isOverLimit ? "text-red-600" : "text-gray-700"}`}>
            Selected: {formatMB(selectedSize)} MB
            {isOverLimit && " — still over 10 MB limit"}
          </p>
        </div>

        <div className="mt-5 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selectedNames)}
            disabled={selectedNames.length === 0 || loading}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <span>Download Selected</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ZipSizeModal;
