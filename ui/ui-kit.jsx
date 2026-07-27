/* ui-kit.jsx — shared UI primitives */

// ── Icons ───────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 16 }) => {
  const paths = {
    play: <path d="M5 3l14 9-14 9z" />,
    pause: <g><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></g>,
    stop: <rect x="5" y="5" width="14" height="14" rx="2"/>,
    chrome: <g><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M12 3v9M21 12l-7.5 4.3M3 12l7.5 4.3"/></g>,
    refresh: <path d="M3 12a9 9 0 0 1 15.5-6.3M21 12a9 9 0 0 1-15.5 6.3M16 5h5V0M8 19H3v5" strokeLinecap="round"/>,
    plus: <path d="M12 5v14M5 12h14" strokeLinecap="round"/>,
    trash: <g><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/></g>,
    search: <g><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5" strokeLinecap="round"/></g>,
    download: <path d="M12 3v12m0 0l-5-5m5 5l5-5M4 19h16" strokeLinecap="round"/>,
    upload: <path d="M12 17V5m0 0l-5 5m5-5l5 5M4 21h16" strokeLinecap="round"/>,
    close: <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round"/>,
    check: <path d="m5 12 5 5L20 7" strokeLinecap="round" strokeLinejoin="round"/>,
    chevronDown: <path d="m6 9 6 6 6-6" strokeLinecap="round"/>,
    chevronRight: <path d="m9 6 6 6-6 6" strokeLinecap="round"/>,
    chevronLeft: <path d="m15 6-6 6 6 6" strokeLinecap="round"/>,
    external: <g><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></g>,
    post: <g><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/><path d="m15 15 2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></g>,
    reply: <g><path d="M10 7 5 12l5 5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 12h8a6 6 0 0 1 6 6v1" strokeLinecap="round"/></g>,
    log: <g><path d="M9 4h10v16H9z"/><path d="M5 4h2v16H5z"/><path d="M12 9h5M12 13h5M12 17h3"/></g>,
    settings: <g><circle cx="12" cy="12" r="3"/><path d="M19 12c0-.5-.1-1-.2-1.4l2-1.6-2-3.5-2.4.8a7 7 0 0 0-2.4-1.4L13.5 2h-4l-.5 2.9a7 7 0 0 0-2.4 1.4l-2.4-.8-2 3.5 2 1.6a7 7 0 0 0 0 2.8l-2 1.6 2 3.5 2.4-.8a7 7 0 0 0 2.4 1.4l.5 2.9h4l.5-2.9a7 7 0 0 0 2.4-1.4l2.4.8 2-3.5-2-1.6c.1-.4.2-.9.2-1.4z"/></g>,
    users: <g><circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0"/><circle cx="17" cy="6" r="3"/><path d="M16 12c4 0 6 2.5 6 6"/></g>,
    history: <g><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></g>,
    chart: <g><path d="M3 20V4"/><path d="M3 20h18"/><path d="M7 16v-5M11 16V8M15 16v-3M19 16V6"/></g>,
    box: <g><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></g>,
    filter: <path d="M3 4h18l-7 9v7l-4-2v-5z"/>,
    telegram: <path d="m21.5 4.5-3 16-7-5.5-3 3v-4.5l11-9-13.5 8L2 11l19.5-6.5z"/>,
    edit: <g><path d="M16 3l5 5L8 21H3v-5L16 3z"/><path d="m14 5 5 5"/></g>,
    eye: <g><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></g>,
    star: <path d="M12 2l3 7 7 .6-5.3 4.7L18 22l-6-4-6 4 1.3-7.7L2 9.6 9 9z"/>,
    bot: <g><rect x="4" y="8" width="16" height="12" rx="2"/><circle cx="9" cy="14" r="1.4"/><circle cx="15" cy="14" r="1.4"/><path d="M12 8V4M9 4h6M8 20v2M16 20v2"/></g>,
    connect: <g><path d="M9 9l-2 2a3.5 3.5 0 0 0 5 5l1-1"/><path d="M15 15l2-2a3.5 3.5 0 0 0-5-5l-1 1"/></g>,
    sortDesc: <path d="M3 6h12M3 12h9M3 18h6M17 4v16m0 0l-3-3m3 3l3-3"/>,
    infoCircle: <g><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01" strokeLinecap="round"/></g>,
    sun: <g><circle cx="12" cy="12" r="4"/><path d="M12 1.75v2.5M12 19.75v2.5M4.22 4.22l1.78 1.78M18 18l1.78 1.78M1.75 12h2.5M19.75 12h2.5M4.22 19.78 6 18M18 6l1.78-1.78" strokeLinecap="round"/></g>,
    moon: <path d="M20.5 14.2A8.8 8.8 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7z" strokeLinecap="round" strokeLinejoin="round"/>,
    copy: <g><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></g>,
    alert: <g><path d="M12 2l10 18H2L12 2z"/><path d="M12 9v5M12 17.5h.01" strokeLinecap="round"/></g>,
    more: <g><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></g>,
    spark: <g><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M18.5 3.5 19 5l1.5.5-1.5.5-.5 1.5-.5-1.5L16.5 5l1.5-.5.5-1.5z"/><path d="M5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16z"/></g>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || null}
    </svg>
  );
};

// ── Checkbox ────────────────────────────────────────────────────────────────
const Checkbox = ({ checked, indeterminate, onChange, label, disabled }) => {
  const click = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    onChange && onChange(!checked);
  };
  return (
    <button type="button"
            className={'checkbox' + (checked ? ' checked' : '') + (indeterminate ? ' indeterminate' : '') + (disabled ? ' disabled' : '')}
            role="checkbox"
            aria-checked={indeterminate ? 'mixed' : !!checked}
            disabled={!!disabled}
            onClick={click}>
      <span className="box">
        {indeterminate
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7"/></svg>}
      </span>
      {label && <span>{label}</span>}
    </button>
  );
};

// ── Spinbox ─────────────────────────────────────────────────────────────────
const Spinbox = ({ value, min = 0, max = 999, step = 1, suffix, onChange }) => {
  const set = (n) => {
    n = Math.max(min, Math.min(max, n));
    onChange && onChange(n);
  };
  return (
    <div className="spin">
      <button onClick={() => set(value - step)}>−</button>
      <input type="number" value={value}
             onChange={(e) => set(Number(e.target.value) || 0)} />
      <button onClick={() => set(value + step)}>+</button>
      {suffix && <span style={{ padding: '0 10px', color: 'var(--fg-muted)', fontSize: 'var(--font-xs)' }}>{suffix}</span>}
    </div>
  );
};

// ── Search input ────────────────────────────────────────────────────────────
const SearchInput = ({ value, onChange, placeholder, style }) => (
  <div className="search" style={style}>
    <Icon name="search" size={14} />
    <input className="input sm" value={value} placeholder={placeholder}
           onChange={(e) => onChange && onChange(e.target.value)} />
  </div>
);

const TableEmptyRow = ({ colSpan, message = 'Không tìm thấy dữ liệu', padding = 24 }) => (
  <tr>
    <td colSpan={colSpan} className="center dim" style={{ padding }}>
      {message}
    </td>
  </tr>
);

// ── Dialog ──────────────────────────────────────────────────────────────────
const Dialog = ({ title, onClose, children, footer, width }) => (
  <div className="dialog-scrim" onClick={onClose}>
    <div className="dialog" style={{ width }} onClick={(e) => e.stopPropagation()}>
      <div className="dialog-hd">
        <h2>{title}</h2>
        <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon name="close" size={14}/></button>
      </div>
      <div className="dialog-body">{children}</div>
      {footer && <div className="dialog-ft">{footer}</div>}
    </div>
  </div>
);

const AppDialogContext = React.createContext(null);

function normalizeDialogOptions(type, options) {
  if (typeof options === 'string') return { type, message: options };
  return { type, ...(options || {}) };
}

function AppDialogRequest({ request, onResolve }) {
  const type = request?.type || 'alert';
  const isPrompt = type === 'prompt';
  const isConfirm = type === 'confirm';
  const [draft, setDraft] = React.useState(request?.defaultValue || '');
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (!isPrompt) return undefined;
    const timer = setTimeout(() => inputRef.current?.focus?.(), 30);
    return () => clearTimeout(timer);
  }, [isPrompt]);

  const title = request.title || (isPrompt ? 'Nhập dữ liệu' : isConfirm ? 'Xác nhận' : 'Thông báo');
  const cancelValue = isPrompt ? null : false;
  const confirmValue = isPrompt ? draft : true;
  const disabled = isPrompt && request.required && !draft.trim();
  const confirmText = request.confirmText || (isPrompt ? 'Xác nhận' : isConfirm ? 'Đồng ý' : 'Đã hiểu');
  const cancelText = request.cancelText || 'Hủy';
  const width = request.width || (isPrompt ? 560 : 460);

  const footer = (
    <>
      {(isConfirm || isPrompt) && (
        <button className="btn" onClick={() => onResolve(cancelValue)}>{cancelText}</button>
      )}
      <button
        className={'btn ' + (request.danger ? 'danger' : 'primary')}
        disabled={disabled}
        onClick={() => onResolve(confirmValue)}>
        {request.icon && <Icon name={request.icon} size={12} />}
        {confirmText}
      </button>
    </>
  );

  return (
    <Dialog title={title} width={width} onClose={() => onResolve(cancelValue)} footer={footer}>
      <div className="app-dialog-content">
        {request.message && (
          <div className="app-dialog-message">
            {request.message}
          </div>
        )}
        {isPrompt && (
          request.multiline ? (
            <textarea
              ref={inputRef}
              className="textarea app-dialog-prompt"
              rows={request.rows || 8}
              placeholder={request.placeholder || ''}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          ) : (
            <input
              ref={inputRef}
              className="input app-dialog-prompt"
              placeholder={request.placeholder || ''}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !disabled) onResolve(confirmValue);
              }}
            />
          )
        )}
      </div>
    </Dialog>
  );
}

window.TableEmptyRow = TableEmptyRow;

function AppDialogProvider({ children }) {
  const [request, setRequest] = React.useState(null);
  const resolverRef = React.useRef(null);

  const open = React.useCallback((nextRequest) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setRequest(nextRequest);
  }), []);

  const api = React.useMemo(() => ({
    alert: (options) => open(normalizeDialogOptions('alert', options)),
    confirm: (options) => open(normalizeDialogOptions('confirm', options)),
    prompt: (options) => open(normalizeDialogOptions('prompt', options)),
  }), [open]);

  const resolveRequest = React.useCallback((value) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    if (resolve) resolve(value);
  }, []);

  React.useEffect(() => {
    window.appDialog = api;
    return () => {
      if (window.appDialog === api) delete window.appDialog;
    };
  }, [api]);

  return (
    <AppDialogContext.Provider value={api}>
      {children}
      {request && <AppDialogRequest request={request} onResolve={resolveRequest} />}
    </AppDialogContext.Provider>
  );
}

const fallbackDialogApi = {
  alert: (options) => {
    const message = typeof options === 'string' ? options : options?.message;
    if (message) console.warn(message);
    return Promise.resolve(true);
  },
  confirm: () => Promise.resolve(false),
  prompt: () => Promise.resolve(null),
};

function useAppDialog() {
  return React.useContext(AppDialogContext) || window.appDialog || fallbackDialogApi;
}

const AppToastContext = React.createContext(null);

function normalizeToastOptions(kind, options) {
  if (typeof options === 'string') return { kind, message: options };
  return { kind, ...(options || {}) };
}

function ToastViewport({ items, onDismiss }) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {items.map((item) => (
        <div key={item.id} className={'toast toast-' + item.kind}>
          <div className="toast-icon">
            <Icon
              name={item.kind === 'success' ? 'check' : item.kind === 'error' ? 'alert' : item.kind === 'warn' ? 'infoCircle' : 'spark'}
              size={14}
            />
          </div>
          <div className="toast-copy">
            {item.title && <div className="toast-title">{item.title}</div>}
            <div className="toast-message">{item.message}</div>
          </div>
          <button className="toast-close" onClick={() => onDismiss(item.id)} aria-label="Đóng thông báo">
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function AppToastProvider({ children }) {
  const [items, setItems] = React.useState([]);

  const dismiss = React.useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const show = React.useCallback((kindOrOptions, maybeOptions) => {
    const normalized = typeof kindOrOptions === 'string'
      ? normalizeToastOptions(kindOrOptions, maybeOptions)
      : normalizeToastOptions(kindOrOptions?.kind || 'info', kindOrOptions);
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const item = {
      id,
      kind: normalized.kind || 'info',
      title: normalized.title || '',
      message: normalized.message || '',
      duration: Number(normalized.duration || 3200),
    };
    setItems((prev) => [...prev, item]);
    if (item.duration > 0) window.setTimeout(() => dismiss(id), item.duration);
    return id;
  }, [dismiss]);

  const api = React.useMemo(() => ({
    show,
    success: (options) => show('success', options),
    error: (options) => show('error', options),
    warn: (options) => show('warn', options),
    info: (options) => show('info', options),
  }), [show]);

  React.useEffect(() => {
    window.appToast = api;
    return () => {
      if (window.appToast === api) delete window.appToast;
    };
  }, [api]);

  return (
    <AppToastContext.Provider value={api}>
      {children}
      {items.length > 0 && <ToastViewport items={items} onDismiss={dismiss} />}
    </AppToastContext.Provider>
  );
}

function useAppToast() {
  return React.useContext(AppToastContext) || window.appToast || {
    show() {},
    success() {},
    error() {},
    warn() {},
    info() {},
  };
}

function showBackendLinkError(dialog, message) {
  const api = dialog || window.appDialog || fallbackDialogApi;
  return api.alert({
    title: 'Không mở được liên kết',
    message: message || 'Hãy kết nối browser trước.',
    icon: 'alert',
  });
}

function openBackendLink(type, url, dialog) {
  if (!url || !window.backendApi?.call) {
    return showBackendLinkError(dialog, 'Backend bridge chưa sẵn sàng.');
  }
  return window.backendApi.call('openLink', type, url)
    .then((res) => {
      if (!res?.ok) return showBackendLinkError(dialog, res?.error || 'Hãy kết nối browser trước.');
      return res;
    })
    .catch((err) => showBackendLinkError(dialog, String(err?.message || err)));
}

// ── Field row ───────────────────────────────────────────────────────────────
const FieldRow = ({ label, help, children }) => (
  <div className="field-row">
    <div>
      <div className="field-label">{label}</div>
      {help && <div className="field-help">{help}</div>}
    </div>
    <div>{children}</div>
  </div>
);

// ── Subtabs (small pill tabs) ───────────────────────────────────────────────
const Subtabs = ({ tabs, value, onChange }) => (
  <div className="tabs-sub">
    {tabs.map((t) => {
      const v = typeof t === 'string' ? t : t.value;
      const l = typeof t === 'string' ? t : t.label;
      const c = typeof t === 'string' ? null : t.count;
      return (
        <button key={v} className={'tab-sub' + (v === value ? ' active' : '')}
                onClick={() => onChange(v)}>
          {l}{c != null && <span style={{ marginLeft: 6, color: 'var(--fg-faint)' }}>{c}</span>}
        </button>
      );
    })}
  </div>
);

// ── Badge ───────────────────────────────────────────────────────────────────
const Badge = ({ kind = '', children, ...props }) => (
  <span className={'badge' + (kind ? ' ' + kind : '')} {...props}>{children}</span>
);

// ── Quick date filter chips ─────────────────────────────────────────────────
const QuickFilter = ({ value, onChange, options }) => (
  <div className="row" style={{ gap: 4 }}>
    {options.map((o) => (
      <button key={o.value}
              className={'btn sm ' + (value === o.value ? 'primary' : '')}
              onClick={() => onChange(o.value)}>
        {o.label}
      </button>
    ))}
  </div>
);

// ── Date input wrapper ──────────────────────────────────────────────────────
const DateInput = ({ value, onChange, label }) => (
  <div className="row" style={{ gap: 6 }}>
    {label && <span className="dim" style={{ fontSize: 'var(--font-xs)' }}>{label}</span>}
    <input type="date" className="input sm" style={{ width: 140 }}
           value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

// ── Segmented choice (for form-row inline picks) ────────────────────────────
const SegmentChoice = ({ value, onChange, options }) => (
  <div className="seg-choice">
    {options.map((o) => (
      <button key={o.value}
              className={'seg-btn' + (value === o.value ? ' active' : '')}
              onClick={() => onChange(o.value)}>
        {o.label}
      </button>
    ))}
  </div>
);

Object.assign(window, {
  Icon, Checkbox, Spinbox, SearchInput, Dialog, FieldRow, Subtabs, Badge,
  QuickFilter, DateInput, SegmentChoice, AppDialogProvider, useAppDialog,
  AppToastProvider, useAppToast, openBackendLink,
});
