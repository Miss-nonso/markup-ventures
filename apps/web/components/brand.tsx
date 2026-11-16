/** Markup Ventures: an open bracket enclosing a rising signal. */
export function Brand() {
  return (
    <div className="brand" aria-label="Markup Ventures">
      <svg
        className="brand-mark"
        width="36"
        height="36"
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M10 4H4V32H10M26 4H32V32H26"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M11 24V17H15V24M21 24V11H25V24"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M18 28V8" stroke="currentColor" strokeWidth="2" />
      </svg>
      <div>
        markup<span>VENTURES / SYSTEMS</span>
      </div>
    </div>
  );
}
