import { useEffect, useId, useRef, useState } from 'react'

/**
 * A dropdown drawn by the page instead of the browser. The default look is a small button for one option
 * of an item ("Size: XL"); `variant="field"` is a full-width form field (State, City).
 * Keyboard: Enter, Space or the arrow keys open it; arrows move, typing jumps to a match, Enter picks, Escape closes.
 */
export function OptionSelect({
  label,
  values,
  value,
  placeholder,
  ariaLabel,
  disabled,
  variant = 'chip',
  onChange,
}: {
  label: string
  values: string[]
  /** '' while nothing is picked. */
  value: string
  placeholder: string
  ariaLabel: string
  disabled?: boolean
  variant?: 'chip' | 'field'
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLSpanElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  // Letters typed in quick succession, for jumping to "Kar…" in a long list.
  const typed = useRef({ text: '', at: 0 })
  const id = useId()

  // Keeps the highlighted option in view in a long list.
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  // A click or tap anywhere else closes the list.
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  function show() {
    // Safari does not focus a button when it is clicked; the keyboard needs it focused.
    button.current?.focus()
    typed.current = { text: '', at: 0 }
    setActive(Math.max(0, values.indexOf(value)))
    setOpen(true)
  }

  function pick(v: string) {
    setOpen(false)
    if (v !== value) onChange(v)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        show()
      }
      return
    }
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') setActive((i) => Math.min(values.length - 1, i + 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
    else if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(values.length - 1)
    else if (e.key === 'Enter' || (e.key === ' ' && typed.current.text === '')) pick(values[active])
    else if (e.key === 'Tab') return setOpen(false)
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now()
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now }
      const match = values.findIndex((v) => v.toLowerCase().startsWith(typed.current.text))
      if (match >= 0) setActive(match)
    } else return
    e.preventDefault()
  }

  return (
    <span className={`opt-select is-${variant} ${open ? 'is-open' : ''}`} ref={root}>
      <button
        ref={button}
        type="button"
        className={`opt-select-button ${value === '' ? 'is-empty' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        aria-label={`${ariaLabel}${value ? `, ${value}` : ''}`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        {value === '' ? (
          placeholder
        ) : (
          <>
            {variant === 'chip' && <span className="opt-select-label">{label}</span>}
            <b>{value}</b>
          </>
        )}
        <svg width="10" height="7" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1 1.5l5 5 5-5" />
        </svg>
      </button>
      {open && (
        <ul className="opt-select-list" role="listbox" id={id} aria-label={ariaLabel} ref={list}>
          {values.map((v, i) => (
            <li
              key={v}
              id={`${id}-${i}`}
              role="option"
              aria-selected={v === value}
              className={`${i === active ? 'is-active' : ''} ${v === value ? 'is-picked' : ''}`}
              onPointerEnter={() => setActive(i)}
              // The button keeps focus, so the pick is taken on press, before any blur.
              onPointerDown={(e) => {
                e.preventDefault()
                pick(v)
              }}
            >
              {v}
              {v === value && (
                <svg width="13" height="10" viewBox="0 0 14 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1.5 5.5l3.5 3.5 7.5-7.5" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
