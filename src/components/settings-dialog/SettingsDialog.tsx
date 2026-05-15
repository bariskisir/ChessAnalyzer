// Renders the engine settings dialog and validates local form values.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import "./SettingsDialog.css";
import type { EngineSettings } from "../../domain/types";

type SettingsDialogProps = {
  show: boolean;
  onClose: () => void;
  settings: EngineSettings;
  onSave: (settings: EngineSettings) => void;
};

/** Clamps a numeric input to the configured inclusive range. */
function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Displays editable engine settings and saves validated values. */
export default function SettingsDialog({
  show,
  onClose,
  settings,
  onSave,
}: SettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<EngineSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  if (!show) return null;

  /** Updates local settings from a form control while enforcing numeric limits. */
  function handleChange(event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    let finalValue: string | number = value;

    if (name === "depth") finalValue = clampNumber(Number.parseInt(value, 10), 10, 18);
    if (name === "variants") finalValue = clampNumber(Number.parseInt(value, 10), 1, 5);
    if (name === "maxThinkingTime") {
      finalValue = clampNumber(Number.parseInt(value, 10), 50, 100);
    }

    setLocalSettings((previousSettings) => ({
      ...previousSettings,
      [name]: finalValue,
    }));
  }

  /** Saves the current local settings to the parent component. */
  function handleSave() {
    onSave(localSettings);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>Engine Settings</h3>
          <button className="close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>API</label>
            <select name="apiUrl" value={localSettings.apiUrl} onChange={handleChange}>
              <option value="https://chess-api.com/v1">Stockfish 17 (chess-api.com)</option>
            </select>
          </div>

          <div className="form-group">
            <label>Depth (10-18)</label>
            <input
              type="number"
              name="depth"
              value={localSettings.depth}
              onChange={handleChange}
              min="10"
              max="18"
            />
          </div>
          <div className="form-group">
            <label>Variants</label>
            <select name="variants" value={localSettings.variants} onChange={handleChange}>
              <option value={1}>1</option>
            </select>
          </div>
          <div className="form-group">
            <label>Thinking Time (50-100 ms)</label>
            <input
              type="number"
              name="maxThinkingTime"
              value={localSettings.maxThinkingTime}
              onChange={handleChange}
              min="50"
              max="100"
              step="10"
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="save-btn" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
