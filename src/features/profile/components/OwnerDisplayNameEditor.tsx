import { displayNameLength, MAX_DISPLAY_NAME_LENGTH } from "@peekpoke/shared";

export function OwnerDisplayNameEditor({
  error,
  id,
  onCancel,
  onChange,
  onSave,
  saving,
  value,
}: {
  error: string | null;
  id: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  value: string;
}) {
  const countId = `${id}-count`;
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="t-body-b text-ink-9">Display name</label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(Array.from(event.target.value).slice(0, MAX_DISPLAY_NAME_LENGTH).join(""))}
        autoComplete="name"
        aria-describedby={countId}
        className="w-full min-h-11 bg-ink-1 border border-hairline rounded-md px-3 py-2 t-body text-ink-8 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      <div className="flex items-center justify-between gap-3">
        <span id={countId} className="t-caption muted">
          {displayNameLength(value)}/{MAX_DISPLAY_NAME_LENGTH}
        </span>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary btn-sm min-h-11" disabled={saving} onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm min-h-11" disabled={saving} onClick={onSave}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {error ? <p role="alert" className="t-caption text-danger-600">{error}</p> : null}
    </div>
  );
}
