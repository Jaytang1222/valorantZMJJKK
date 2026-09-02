"use client";

export function ConfirmDeleteUserButton({
  label,
  message,
}: {
  label: string;
  message: string;
}) {
  return (
    <button
      className="danger"
      type="submit"
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
