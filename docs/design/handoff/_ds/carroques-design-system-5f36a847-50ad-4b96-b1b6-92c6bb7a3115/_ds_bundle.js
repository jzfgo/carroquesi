/* @ds-bundle: {"format":3,"namespace":"CarroQueSDesignSystem_5f36a8","components":[],"sourceHashes":{"design_handoff_design_system/ui_kit/App.jsx":"0202710e67ca","design_handoff_design_system/ui_kit/components/ActionSheet.jsx":"7591b2432c0b","design_handoff_design_system/ui_kit/components/DashboardScreen.jsx":"ebddfd9575b3","design_handoff_design_system/ui_kit/components/Icon.jsx":"33bcc2ee32c2","design_handoff_design_system/ui_kit/components/ListScreen.jsx":"8bd1154a657d","design_handoff_design_system/ui_kit/components/SignInScreen.jsx":"77e385a9c84f","design_handoff_design_system/ui_kit/components/Toast.jsx":"59166f622a11","design_handoff_design_system/ui_kit/components/Wordmark.jsx":"c4ef733dbf50","design_handoff_design_system/ui_kit/components/mockData.js":"2a6f01fd74df","design_handoff_design_system/ui_kit/ios-frame.jsx":"d67eb3ffe562","ui_kits/app/App.jsx":"0202710e67ca","ui_kits/app/components/ActionSheet.jsx":"7591b2432c0b","ui_kits/app/components/DashboardScreen.jsx":"ebddfd9575b3","ui_kits/app/components/Icon.jsx":"33bcc2ee32c2","ui_kits/app/components/ListScreen.jsx":"8bd1154a657d","ui_kits/app/components/SignInScreen.jsx":"77e385a9c84f","ui_kits/app/components/Toast.jsx":"59166f622a11","ui_kits/app/components/Wordmark.jsx":"c4ef733dbf50","ui_kits/app/components/mockData.js":"2a6f01fd74df","ui_kits/app/ios-frame.jsx":"d67eb3ffe562"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.CarroQueSDesignSystem_5f36a8 = window.CarroQueSDesignSystem_5f36a8 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// design_handoff_design_system/ui_kit/App.jsx
try { (() => {
// App — root, owns screen state and runs the interactive demo.
function App() {
  const {
    MEMBERS,
    LISTS,
    STORES_BY_LIST
  } = window.CARRO_DATA;
  const [screen, setScreen] = React.useState('signin'); // 'signin' | 'dashboard' | 'list'
  const [lists, setLists] = React.useState(() => structuredClone(LISTS));
  const [activeListId, setActiveListId] = React.useState(null);
  const [sheet, setSheet] = React.useState(null); // { kind, payload }
  const [toast, setToast] = React.useState(null);
  const activeList = lists.find(l => l.id === activeListId);
  const handleToggle = itemId => {
    setLists(ls => ls.map(l => l.id !== activeListId ? l : {
      ...l,
      items: l.items.map(i => i.id === itemId ? {
        ...i,
        purchased: !i.purchased
      } : i)
    }));
    const item = activeList?.items.find(i => i.id === itemId);
    if (item && !item.purchased) setToast({
      message: `${item.name} comprado`
    });
  };
  const handleAddItem = name => {
    setLists(ls => ls.map(l => l.id !== activeListId ? l : {
      ...l,
      items: [...l.items, {
        id: 'new-' + Date.now(),
        name,
        qty: null,
        brand: null,
        stores: [],
        price: null,
        pricePer: null,
        purchased: false,
        by: 'u1'
      }]
    }));
  };
  let body;
  if (screen === 'signin') {
    body = /*#__PURE__*/React.createElement(SignInScreen, {
      onSignIn: () => setScreen('dashboard')
    });
  } else if (screen === 'dashboard') {
    body = /*#__PURE__*/React.createElement(DashboardScreen, {
      lists: lists,
      onOpenList: id => {
        setActiveListId(id);
        setScreen('list');
      },
      onMenu: id => {
        if (id === '__new') {
          setSheet({
            kind: 'new-list'
          });
        } else {
          setSheet({
            kind: 'list-options',
            payload: id
          });
        }
      },
      onAvatar: () => setSheet({
        kind: 'account'
      })
    });
  } else if (screen === 'list' && activeList) {
    body = /*#__PURE__*/React.createElement(ListScreen, {
      list: activeList,
      members: MEMBERS,
      stores: STORES_BY_LIST[activeList.id] || [],
      onBack: () => setScreen('dashboard'),
      onMenu: () => setSheet({
        kind: 'list-members'
      }),
      onToggle: handleToggle,
      onItemMenu: itemId => setSheet({
        kind: 'item-options',
        payload: itemId
      }),
      onAddItem: handleAddItem
    });
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "app"
  }, body, sheet?.kind === 'item-options' && (() => {
    const item = activeList?.items.find(i => i.id === sheet.payload);
    return /*#__PURE__*/React.createElement(ActionSheet, {
      title: item?.name,
      actions: [{
        icon: 'pencil',
        label: 'Renombrar',
        onClick: () => {}
      }, {
        icon: 'euro',
        label: 'Registrar precio',
        onClick: () => {}
      }, {
        icon: 'copy',
        label: 'Duplicar en otra lista',
        onClick: () => {}
      }, {
        icon: 'trash-2',
        label: 'Eliminar producto',
        danger: true,
        onClick: () => {
          setLists(ls => ls.map(l => l.id !== activeListId ? l : {
            ...l,
            items: l.items.filter(i => i.id !== sheet.payload)
          }));
          setToast({
            message: 'Producto eliminado'
          });
        }
      }],
      onClose: () => setSheet(null)
    });
  })(), sheet?.kind === 'list-options' && (() => {
    const list = lists.find(l => l.id === sheet.payload);
    return /*#__PURE__*/React.createElement(ActionSheet, {
      title: list?.name,
      actions: [{
        icon: 'pencil',
        label: 'Renombrar lista'
      }, {
        icon: 'smile',
        label: 'Cambiar emoji'
      }, {
        icon: 'user-plus',
        label: 'Invitar a alguien'
      }, {
        icon: 'trash-2',
        label: 'Eliminar lista',
        danger: true
      }],
      onClose: () => setSheet(null)
    });
  })(), sheet?.kind === 'new-list' && /*#__PURE__*/React.createElement(ActionSheet, {
    title: "Nueva lista",
    actions: [{
      icon: 'plus',
      label: 'Lista en blanco'
    }, {
      icon: 'copy',
      label: 'Duplicar otra lista'
    }, {
      icon: 'sparkles',
      label: 'Sugerencias para empezar'
    }],
    onClose: () => setSheet(null)
  }), sheet?.kind === 'list-members' && /*#__PURE__*/React.createElement(ActionSheet, {
    title: "Miembros de la lista",
    actions: [{
      icon: 'user-plus',
      label: 'Invitar por enlace'
    }, {
      icon: 'qr-code',
      label: 'Compartir QR'
    }, {
      icon: 'log-out',
      label: 'Salir de la lista',
      danger: true
    }],
    onClose: () => setSheet(null)
  }), sheet?.kind === 'account' && /*#__PURE__*/React.createElement(ActionSheet, {
    title: "Tu cuenta",
    actions: [{
      icon: 'download',
      label: 'Instalar app'
    }, {
      icon: 'settings',
      label: 'Configuración'
    }, {
      icon: 'moon',
      label: 'Modo oscuro'
    }, {
      icon: 'log-out',
      label: 'Cerrar sesión',
      danger: true
    }],
    onClose: () => setSheet(null)
  }), toast && /*#__PURE__*/React.createElement(Toast, {
    message: toast.message,
    onDismiss: () => setToast(null)
  }));
}
window.App = App;
})(); } catch (e) { __ds_ns.__errors.push({ path: "design_handoff_design_system/ui_kit/App.jsx", error: String((e && e.message) || e) }); }

// design_handoff_design_system/ui_kit/components/ActionSheet.jsx
try { (() => {
// ActionSheet — bottom sheet menu, used for item options + list options.
function ActionSheet({
  title,
  actions,
  onClose
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "sheet-overlay",
    onClick: onClose
  }), /*#__PURE__*/React.createElement("div", {
    className: "sheet",
    role: "dialog",
    "aria-modal": "true"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sheet__handle"
  }), title && /*#__PURE__*/React.createElement("div", {
    className: "sheet__title"
  }, title), actions.map((a, idx) => /*#__PURE__*/React.createElement("button", {
    key: idx,
    className: `sheet__row${a.danger ? ' sheet__row--danger' : ''}`,
    onClick: () => {
      a.onClick && a.onClick();
      onClose();
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "sheet__icon"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: a.icon,
    size: 20
  })), a.label))));
}
window.ActionSheet = ActionSheet;
})(); } catch (e) { __ds_ns.__errors.push({ path: "design_handoff_design_system/ui_kit/components/ActionSheet.jsx", error: String((e && e.message) || e) }); }

// design_handoff_design_system/ui_kit/components/DashboardScreen.jsx
try { (() => {
// DashboardScreen — lists overview.
function DashboardScreen({
  lists,
  onOpenList,
  onMenu,
  onAvatar
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("header", {
    className: "app-header"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "app-header__title"
  }, /*#__PURE__*/React.createElement(Wordmark, {
    size: 26
  })), /*#__PURE__*/React.createElement("button", {
    className: "app-header__action",
    "aria-label": "Buscar"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 20
  })), /*#__PURE__*/React.createElement("button", {
    className: "app-header__avatar",
    style: {
      background: '#1F3A8A'
    },
    onClick: onAvatar,
    "aria-label": "Tu cuenta"
  }, "M")), /*#__PURE__*/React.createElement("main", {
    className: "dashboard"
  }, lists.map(list => /*#__PURE__*/React.createElement(ListCard, {
    key: list.id,
    list: list,
    onOpen: () => onOpenList(list.id),
    onMenu: () => onMenu(list.id)
  })), /*#__PURE__*/React.createElement("button", {
    className: "create-list",
    onClick: () => onMenu('__new')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 18
  }), "Nueva lista")));
}
function ListCard({
  list,
  onOpen,
  onMenu
}) {
  const total = list.items.length;
  const purchased = list.items.filter(i => i.purchased).length;
  const pct = total === 0 ? 0 : Math.round(purchased / total * 100);
  return /*#__PURE__*/React.createElement("div", {
    className: "list-card"
  }, /*#__PURE__*/React.createElement("span", {
    className: "list-card__drag",
    "aria-hidden": true
  }, "\u283F"), /*#__PURE__*/React.createElement("button", {
    className: "list-card__emoji",
    "aria-label": "Cambiar emoji"
  }, list.emoji), /*#__PURE__*/React.createElement("button", {
    className: "list-card__main",
    onClick: onOpen
  }, /*#__PURE__*/React.createElement("span", {
    className: "list-card__title"
  }, list.name), total > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "list-card__bar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "list-card__fill",
    style: {
      width: `${pct}%`,
      background: pct === 100 ? 'var(--verde-0)' : undefined
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "list-card__sub"
  }, purchased, " de ", total, " comprados")), total === 0 && /*#__PURE__*/React.createElement("span", {
    className: "list-card__sub"
  }, "vac\xEDa \xB7 a\xF1ade lo primero")), /*#__PURE__*/React.createElement("button", {
    className: "list-card__menu",
    onClick: e => {
      e.stopPropagation();
      onMenu();
    },
    "aria-label": "Opciones"
  }, "\u22EF"));
}
window.DashboardScreen = DashboardScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "design_handoff_design_system/ui_kit/components/DashboardScreen.jsx", error: String((e && e.message) || e) }); }

// design_handoff_design_system/ui_kit/components/Icon.jsx
try { (() => {
/* global lucide, React */
// Small wrapper around Lucide. Renders an inline SVG <i> tag and
// runs lucide.createIcons() on each render so the icon paints.
function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  color,
  style
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      window.lucide.createIcons({
        attrs: {
          'stroke-width': strokeWidth,
          width: size,
          height: size
        },
        nameAttr: 'data-lucide',
        // Only create icons within this node
        // eslint-disable-next-line
        ...(typeof lucide.createIcons === 'function' ? {} : {})
      });
    }
  });
  return /*#__PURE__*/React.createElement("i", {
    ref: ref,
    "data-lucide": name,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      color: color || 'currentColor',
      ...style
    }
  });
}
window.Icon = Icon;
})(); } catch (e) { __ds_ns.__errors.push({ path: "design_handoff_design_system/ui_kit/components/Icon.jsx", error: String((e && e.message) || e) }); }

// design_handoff_design_system/ui_kit/components/ListScreen.jsx
try { (() => {
// ListScreen — main list editing surface.
function ListScreen({
  list,
  members,
  stores,
  onBack,
  onMenu,
  onToggle,
  onItemMenu,
  onAddItem
}) {
  const [filter, setFilter] = React.useState('Todas');
  const [showSuggestion, setShowSuggestion] = React.useState(true);
  const [inputValue, setInputValue] = React.useState('');
  const filtered = filter === 'Todas' ? list.items : list.items.filter(i => i.stores.includes(filter));
  const total = filtered.length;
  const purchased = filtered.filter(i => i.purchased).length;
  const pct = total === 0 ? 0 : Math.round(purchased / total * 100);
  const memberMap = new Map(members.map(m => [m.id, m]));
  const pendingItems = filtered.filter(i => !i.purchased);
  const purchasedItems = filtered.filter(i => i.purchased);
  const pendingTotal = pendingItems.reduce((s, i) => s + (i.price || 0) * (i.pricePer === 'KILOGRAM' ? parseFloat(i.qty) || 0 : 1), 0);
  const purchasedTotal = purchasedItems.reduce((s, i) => s + (i.price || 0) * (i.pricePer === 'KILOGRAM' ? parseFloat(i.qty) || 0 : 1), 0);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("header", {
    className: "app-header"
  }, /*#__PURE__*/React.createElement("button", {
    className: "app-header__back",
    onClick: onBack
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-left",
    size: 20
  }), " Listas"), /*#__PURE__*/React.createElement("h1", {
    className: "app-header__title app-header__title--listname"
  }, /*#__PURE__*/React.createElement("span", {
    className: "emoji"
  }, list.emoji), list.name), /*#__PURE__*/React.createElement("button", {
    className: "app-header__action",
    onClick: onMenu,
    "aria-label": "Miembros"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users",
    size: 20
  }))), /*#__PURE__*/React.createElement("div", {
    className: "progress"
  }, /*#__PURE__*/React.createElement("div", {
    className: "progress__fill",
    style: {
      width: pct + '%',
      background: pct === 100 ? 'var(--verde-0)' : undefined
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "filter-bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "filter-chip filter-chip--search",
    "aria-label": "Buscar"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 16
  })), ['Todas', ...stores].map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    className: `filter-chip${filter === s ? ' filter-chip--active' : ''}`,
    onClick: () => setFilter(s)
  }, s))), /*#__PURE__*/React.createElement("div", {
    className: "totals-row"
  }, /*#__PURE__*/React.createElement("span", null, "Pendiente ", /*#__PURE__*/React.createElement("span", {
    className: "amt"
  }, "\u20AC ", pendingTotal.toFixed(2).replace('.', ','))), /*#__PURE__*/React.createElement("span", null, "Comprado ", /*#__PURE__*/React.createElement("span", {
    className: "amt",
    style: {
      color: 'var(--verde-0)'
    }
  }, "\u20AC ", purchasedTotal.toFixed(2).replace('.', ',')))), /*#__PURE__*/React.createElement("div", {
    className: "item-list"
  }, filtered.map(item => /*#__PURE__*/React.createElement(ItemRow, {
    key: item.id,
    item: item,
    member: memberMap.get(item.by),
    onToggle: () => onToggle(item.id),
    onMenu: () => onItemMenu(item.id)
  }))), /*#__PURE__*/React.createElement(SmartInput, {
    value: inputValue,
    onChange: setInputValue,
    showSuggestion: showSuggestion,
    onDismissSuggestion: () => setShowSuggestion(false),
    onAddSuggestion: () => {
      onAddItem('Leche entera');
      setShowSuggestion(false);
    },
    onSubmit: () => {
      if (inputValue.trim()) {
        onAddItem(inputValue.trim());
        setInputValue('');
      }
    }
  }));
}
function ItemRow({
  item,
  member,
  onToggle,
  onMenu
}) {
  const fmtPrice = (p, per) => {
    if (p == null) return null;
    const s = `€ ${p.toFixed(2).replace('.', ',')}`;
    return per === 'KILOGRAM' ? `${s} / kg` : s;
  };
  return /*#__PURE__*/React.createElement("div", {
    className: `item${item.purchased ? ' item--purchased' : ''}`
  }, /*#__PURE__*/React.createElement("button", {
    className: `check${item.purchased ? ' check--on' : ''}`,
    role: "checkbox",
    "aria-checked": item.purchased,
    onClick: onToggle,
    "aria-label": item.purchased ? 'Marcar como no comprado' : 'Marcar como comprado'
  }), /*#__PURE__*/React.createElement("div", {
    className: "item__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "item__name-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "item__name"
  }, item.name), item.qty && /*#__PURE__*/React.createElement("span", {
    className: "item__qty"
  }, item.qty)), /*#__PURE__*/React.createElement("div", {
    className: "item__tags"
  }, item.brand && /*#__PURE__*/React.createElement("button", {
    className: "item-tag"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "tag",
    size: 11
  }), " ", item.brand), item.stores.map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    className: "item-tag"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "store",
    size: 11
  }), " ", s)), item.price != null ? /*#__PURE__*/React.createElement("button", {
    className: "item-tag item-tag--price"
  }, fmtPrice(item.price, item.pricePer)) : !item.purchased && /*#__PURE__*/React.createElement("button", {
    className: "item-tag item-tag--cta"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 11
  }), " precio"), !item.brand && !item.purchased && /*#__PURE__*/React.createElement("button", {
    className: "item-tag item-tag--cta"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 11
  }), " marca"), item.stores.length === 0 && !item.purchased && /*#__PURE__*/React.createElement("button", {
    className: "item-tag item-tag--cta"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 11
  }), " tienda"))), /*#__PURE__*/React.createElement("div", {
    className: "item__right"
  }, (() => {
    const isSelf = member.id === 'u1';
    const avatarStyle = isSelf ? {
      background: 'var(--tinta-0)',
      color: 'var(--accent-fg)'
    } : {
      background: 'var(--paper-2)',
      color: 'var(--ink-1)'
    };
    return /*#__PURE__*/React.createElement("div", {
      className: "item__avatar",
      style: avatarStyle
    }, member.initial);
  })(), /*#__PURE__*/React.createElement("button", {
    className: "item__menu",
    onClick: e => {
      e.stopPropagation();
      onMenu();
    },
    "aria-label": "Opciones"
  }, "\u22EF")));
}
function SmartInput({
  value,
  onChange,
  onSubmit,
  showSuggestion,
  onAddSuggestion,
  onDismissSuggestion
}) {
  const parsed = React.useMemo(() => {
    // toy parser for preview only
    const tokens = value.split(/\s+/);
    const out = {
      name: [],
      qty: null,
      brand: null,
      stores: [],
      price: null
    };
    tokens.forEach(t => {
      if (!t) return;
      if (t.startsWith('#')) out.brand = t.slice(1) || null;else if (t.startsWith('@')) {
        const s = t.slice(1);
        if (s) out.stores.push(s);
      } else if (t.startsWith('+')) out.qty = t.slice(1) || null;else if (t.startsWith('$')) {
        const n = parseFloat(t.slice(1).replace(',', '.'));
        if (!isNaN(n)) out.price = n;
      } else out.name.push(t);
    });
    out.name = out.name.join(' ').trim();
    return out;
  }, [value]);
  const hasSigil = parsed.qty || parsed.brand || parsed.stores.length || parsed.price != null;
  const hasName = parsed.name.length > 0;
  const sigils = [{
    sigil: '+',
    label: 'cant.'
  }, {
    sigil: '#',
    label: 'marca'
  }, {
    sigil: '@',
    label: 'tienda'
  }, {
    sigil: '$',
    label: 'precio'
  }, {
    sigil: '|',
    label: 'cód.'
  }];
  const insertSigil = s => {
    const next = value && !value.endsWith(' ') ? value + ' ' + s : value + s;
    onChange(next);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "smart-input"
  }, showSuggestion && /*#__PURE__*/React.createElement("div", {
    className: "suggestion-banner"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 20
    }
  }, "\uD83C\uDF3F"), /*#__PURE__*/React.createElement("span", {
    className: "text"
  }, "Sueles comprar ", /*#__PURE__*/React.createElement("b", null, "leche entera"), " los jueves."), /*#__PURE__*/React.createElement("button", {
    className: "add",
    onClick: onAddSuggestion
  }, "A\xF1adir"), /*#__PURE__*/React.createElement("button", {
    onClick: onDismissSuggestion,
    "aria-label": "Descartar",
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--fg-subtle)',
      padding: 2
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16
  }))), hasSigil && /*#__PURE__*/React.createElement("div", {
    className: "input-preview"
  }, hasName ? /*#__PURE__*/React.createElement("span", {
    className: "name"
  }, parsed.name) : /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--tomate-0)'
    }
  }, "Sin nombre"), parsed.qty && /*#__PURE__*/React.createElement("span", {
    className: "qty"
  }, parsed.qty), parsed.brand && /*#__PURE__*/React.createElement("span", {
    className: "ptag"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "tag",
    size: 11
  }), " ", parsed.brand), parsed.stores.map(s => /*#__PURE__*/React.createElement("span", {
    key: s,
    className: "ptag"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "store",
    size: 11
  }), " ", s)), parsed.price != null && /*#__PURE__*/React.createElement("span", {
    className: "ptag"
  }, "\u20AC ", parsed.price.toFixed(2).replace('.', ','))), /*#__PURE__*/React.createElement("div", {
    className: "legend"
  }, sigils.map(({
    sigil,
    label
  }) => /*#__PURE__*/React.createElement("button", {
    key: sigil,
    className: "legend__chip",
    onClick: () => insertSigil(sigil)
  }, /*#__PURE__*/React.createElement("b", null, sigil), label))), /*#__PURE__*/React.createElement("div", {
    className: "input-row"
  }, /*#__PURE__*/React.createElement("input", {
    className: "input-row__input",
    placeholder: "A\xF1adir producto\u2026",
    value: value,
    onChange: e => onChange(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter' && hasName) onSubmit();
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "input-row__scan",
    "aria-label": "Escanear"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "scan-line",
    size: 18
  })), /*#__PURE__*/React.createElement("button", {
    className: "input-row__add",
    onClick: onSubmit,
    disabled: !hasName,
    "aria-label": "A\xF1adir"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 20
  }))));
}
window.ListScreen = ListScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "design_handoff_design_system/ui_kit/components/ListScreen.jsx", error: String((e && e.message) || e) }); }

// design_handoff_design_system/ui_kit/components/SignInScreen.jsx
try { (() => {
// SignInScreen — mascot, wordmark, single CTA.
function SignInScreen({
  onSignIn
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "signin"
  }, /*#__PURE__*/React.createElement("img", {
    className: "signin__mascot",
    src: "../../assets/mascot.png",
    alt: ""
  }), /*#__PURE__*/React.createElement("div", {
    className: "signin__hand"
  }, "\xA1a por ello!"), /*#__PURE__*/React.createElement("h1", {
    className: "signin__title"
  }, /*#__PURE__*/React.createElement(Wordmark, {
    size: 56
  })), /*#__PURE__*/React.createElement("p", {
    className: "signin__tag"
  }, "Lista de la compra compartida.", /*#__PURE__*/React.createElement("br", null), "Sencilla. Para toda la familia."), /*#__PURE__*/React.createElement("button", {
    className: "signin__cta",
    onClick: onSignIn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "log-in",
    size: 18
  }), "Continuar con Google"), /*#__PURE__*/React.createElement("p", {
    className: "signin__legal"
  }, "Al continuar aceptas los ", /*#__PURE__*/React.createElement("a", {
    style: {
      color: 'var(--accent)'
    }
  }, "t\xE9rminos"), " y la ", /*#__PURE__*/React.createElement("a", {
    style: {
      color: 'var(--accent)'
    }
  }, "privacidad"), "."));
}
window.SignInScreen = SignInScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "design_handoff_design_system/ui_kit/components/SignInScreen.jsx", error: String((e && e.message) || e) }); }

// design_handoff_design_system/ui_kit/components/Toast.jsx
try { (() => {
// Toast — auto-dismissing snack-style confirmation.
function Toast({
  message,
  onUndo,
  onDismiss
}) {
  React.useEffect(() => {
    const id = setTimeout(onDismiss, 4000);
    return () => clearTimeout(id);
  }, [onDismiss]);
  return /*#__PURE__*/React.createElement("div", {
    className: "toast",
    role: "status"
  }, /*#__PURE__*/React.createElement("span", {
    className: "toast__dot"
  }), /*#__PURE__*/React.createElement("span", null, message), onUndo && /*#__PURE__*/React.createElement("button", {
    className: "toast__undo",
    onClick: onUndo
  }, "Deshacer"));
}
window.Toast = Toast;
})(); } catch (e) { __ds_ns.__errors.push({ path: "design_handoff_design_system/ui_kit/components/Toast.jsx", error: String((e && e.message) || e) }); }

// design_handoff_design_system/ui_kit/components/Wordmark.jsx
try { (() => {
// Wordmark — "CarroQueSí" stylized as ONE word, but each of the
// three underlying words in its own brand color (blue / red / green).
function Wordmark({
  size = 32,
  dark = false
}) {
  const tickSize = Math.round(size * 0.55);
  return /*#__PURE__*/React.createElement("span", {
    className: `wordmark${dark ? ' wordmark--dark' : ''}`,
    style: {
      fontSize: size
    },
    "aria-label": "CarroQueS\xED"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wordmark__word wordmark__word--1"
  }, "Carro"), /*#__PURE__*/React.createElement("span", {
    className: "wordmark__word wordmark__word--2"
  }, "Que"), /*#__PURE__*/React.createElement("span", {
    className: "wordmark__word wordmark__word--3"
  }, "S\xED"), /*#__PURE__*/React.createElement("svg", {
    className: "wordmark__tick",
    width: tickSize,
    height: tickSize,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "3.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 12 l6 6 l13 -14"
  })));
}
window.Wordmark = Wordmark;
})(); } catch (e) { __ds_ns.__errors.push({ path: "design_handoff_design_system/ui_kit/components/Wordmark.jsx", error: String((e && e.message) || e) }); }

// design_handoff_design_system/ui_kit/components/mockData.js
try { (() => {
// Static demo data. The kit fakes interactivity but never hits a backend.

const MEMBERS = [{
  id: 'u1',
  initial: 'M',
  color: '#1F3A8A',
  name: 'Marta'
}, {
  id: 'u2',
  initial: 'L',
  color: '#C0392B',
  name: 'Lucía'
}, {
  id: 'u3',
  initial: 'A',
  color: '#3A7A4A',
  name: 'Andrés'
}, {
  id: 'u4',
  initial: 'P',
  color: '#C9941F',
  name: 'Pablo'
}];
const LISTS = [{
  id: 'l1',
  emoji: '🥑',
  name: 'Semana del 12',
  items: [{
    id: 'i1',
    name: 'Aceite de oliva v.e.',
    qty: '1 L',
    brand: 'Hacendado',
    stores: ['Mercadona'],
    price: 6.99,
    pricePer: null,
    purchased: false,
    by: 'u1'
  }, {
    id: 'i2',
    name: 'Tomates pera',
    qty: '2 kg',
    brand: null,
    stores: ['Mercadona'],
    price: 1.89,
    pricePer: 'KILOGRAM',
    purchased: true,
    by: 'u2'
  }, {
    id: 'i3',
    name: 'Leche entera',
    qty: '6 ud',
    brand: null,
    stores: [],
    price: null,
    pricePer: null,
    purchased: false,
    by: 'u3'
  }, {
    id: 'i4',
    name: 'Pan de masa madre',
    qty: null,
    brand: null,
    stores: ['Panadería'],
    price: 3.20,
    pricePer: null,
    purchased: false,
    by: 'u1'
  }, {
    id: 'i5',
    name: 'Plátanos de Canarias',
    qty: '1 kg',
    brand: null,
    stores: ['Mercadona'],
    price: 2.49,
    pricePer: 'KILOGRAM',
    purchased: true,
    by: 'u4'
  }, {
    id: 'i6',
    name: 'Queso curado',
    qty: '300 g',
    brand: 'García Baquero',
    stores: ['Lidl'],
    price: null,
    pricePer: null,
    purchased: false,
    by: 'u1'
  }, {
    id: 'i7',
    name: 'Café molido',
    qty: null,
    brand: 'Marcilla',
    stores: ['Carrefour'],
    price: 4.10,
    pricePer: null,
    purchased: false,
    by: 'u2'
  }, {
    id: 'i8',
    name: 'Pasta integral',
    qty: '500 g',
    brand: null,
    stores: ['Mercadona'],
    price: null,
    pricePer: null,
    purchased: false,
    by: 'u3'
  }]
}, {
  id: 'l2',
  emoji: '🎉',
  name: 'Cumple de Lucía',
  items: [{
    id: 'b1',
    name: 'Tarta de chocolate',
    qty: null,
    brand: null,
    stores: ['Panadería'],
    price: 18.50,
    pricePer: null,
    purchased: true,
    by: 'u1'
  }, {
    id: 'b2',
    name: 'Velas',
    qty: null,
    brand: null,
    stores: ['Tiger'],
    price: 2.99,
    pricePer: null,
    purchased: true,
    by: 'u2'
  }, {
    id: 'b3',
    name: 'Refrescos',
    qty: '6 ud',
    brand: null,
    stores: ['Mercadona'],
    price: 4.20,
    pricePer: null,
    purchased: true,
    by: 'u1'
  }]
}, {
  id: 'l3',
  emoji: '🌮',
  name: 'Tacos viernes',
  items: [{
    id: 't1',
    name: 'Tortillas de maíz',
    qty: null,
    brand: 'Bimbo',
    stores: ['Carrefour'],
    price: null,
    pricePer: null,
    purchased: false,
    by: 'u3'
  }, {
    id: 't2',
    name: 'Aguacates',
    qty: '4 ud',
    brand: null,
    stores: ['Mercadona'],
    price: 1.20,
    pricePer: null,
    purchased: false,
    by: 'u3'
  }, {
    id: 't3',
    name: 'Cilantro fresco',
    qty: null,
    brand: null,
    stores: ['Mercadona'],
    price: null,
    pricePer: null,
    purchased: false,
    by: 'u4'
  }]
}];
const STORES_BY_LIST = {
  l1: ['Mercadona', 'Lidl', 'Carrefour', 'Panadería'],
  l2: ['Panadería', 'Tiger', 'Mercadona'],
  l3: ['Mercadona', 'Carrefour']
};
window.CARRO_DATA = {
  MEMBERS,
  LISTS,
  STORES_BY_LIST
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "design_handoff_design_system/ui_kit/components/mockData.js", error: String((e && e.message) || e) }); }

// design_handoff_design_system/ui_kit/ios-frame.jsx
try { (() => {
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports: IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "design_handoff_design_system/ui_kit/ios-frame.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/App.jsx
try { (() => {
// App — root, owns screen state and runs the interactive demo.
function App() {
  const {
    MEMBERS,
    LISTS,
    STORES_BY_LIST
  } = window.CARRO_DATA;
  const [screen, setScreen] = React.useState('signin'); // 'signin' | 'dashboard' | 'list'
  const [lists, setLists] = React.useState(() => structuredClone(LISTS));
  const [activeListId, setActiveListId] = React.useState(null);
  const [sheet, setSheet] = React.useState(null); // { kind, payload }
  const [toast, setToast] = React.useState(null);
  const activeList = lists.find(l => l.id === activeListId);
  const handleToggle = itemId => {
    setLists(ls => ls.map(l => l.id !== activeListId ? l : {
      ...l,
      items: l.items.map(i => i.id === itemId ? {
        ...i,
        purchased: !i.purchased
      } : i)
    }));
    const item = activeList?.items.find(i => i.id === itemId);
    if (item && !item.purchased) setToast({
      message: `${item.name} comprado`
    });
  };
  const handleAddItem = name => {
    setLists(ls => ls.map(l => l.id !== activeListId ? l : {
      ...l,
      items: [...l.items, {
        id: 'new-' + Date.now(),
        name,
        qty: null,
        brand: null,
        stores: [],
        price: null,
        pricePer: null,
        purchased: false,
        by: 'u1'
      }]
    }));
  };
  let body;
  if (screen === 'signin') {
    body = /*#__PURE__*/React.createElement(SignInScreen, {
      onSignIn: () => setScreen('dashboard')
    });
  } else if (screen === 'dashboard') {
    body = /*#__PURE__*/React.createElement(DashboardScreen, {
      lists: lists,
      onOpenList: id => {
        setActiveListId(id);
        setScreen('list');
      },
      onMenu: id => {
        if (id === '__new') {
          setSheet({
            kind: 'new-list'
          });
        } else {
          setSheet({
            kind: 'list-options',
            payload: id
          });
        }
      },
      onAvatar: () => setSheet({
        kind: 'account'
      })
    });
  } else if (screen === 'list' && activeList) {
    body = /*#__PURE__*/React.createElement(ListScreen, {
      list: activeList,
      members: MEMBERS,
      stores: STORES_BY_LIST[activeList.id] || [],
      onBack: () => setScreen('dashboard'),
      onMenu: () => setSheet({
        kind: 'list-members'
      }),
      onToggle: handleToggle,
      onItemMenu: itemId => setSheet({
        kind: 'item-options',
        payload: itemId
      }),
      onAddItem: handleAddItem
    });
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "app"
  }, body, sheet?.kind === 'item-options' && (() => {
    const item = activeList?.items.find(i => i.id === sheet.payload);
    return /*#__PURE__*/React.createElement(ActionSheet, {
      title: item?.name,
      actions: [{
        icon: 'pencil',
        label: 'Renombrar',
        onClick: () => {}
      }, {
        icon: 'euro',
        label: 'Registrar precio',
        onClick: () => {}
      }, {
        icon: 'copy',
        label: 'Duplicar en otra lista',
        onClick: () => {}
      }, {
        icon: 'trash-2',
        label: 'Eliminar producto',
        danger: true,
        onClick: () => {
          setLists(ls => ls.map(l => l.id !== activeListId ? l : {
            ...l,
            items: l.items.filter(i => i.id !== sheet.payload)
          }));
          setToast({
            message: 'Producto eliminado'
          });
        }
      }],
      onClose: () => setSheet(null)
    });
  })(), sheet?.kind === 'list-options' && (() => {
    const list = lists.find(l => l.id === sheet.payload);
    return /*#__PURE__*/React.createElement(ActionSheet, {
      title: list?.name,
      actions: [{
        icon: 'pencil',
        label: 'Renombrar lista'
      }, {
        icon: 'smile',
        label: 'Cambiar emoji'
      }, {
        icon: 'user-plus',
        label: 'Invitar a alguien'
      }, {
        icon: 'trash-2',
        label: 'Eliminar lista',
        danger: true
      }],
      onClose: () => setSheet(null)
    });
  })(), sheet?.kind === 'new-list' && /*#__PURE__*/React.createElement(ActionSheet, {
    title: "Nueva lista",
    actions: [{
      icon: 'plus',
      label: 'Lista en blanco'
    }, {
      icon: 'copy',
      label: 'Duplicar otra lista'
    }, {
      icon: 'sparkles',
      label: 'Sugerencias para empezar'
    }],
    onClose: () => setSheet(null)
  }), sheet?.kind === 'list-members' && /*#__PURE__*/React.createElement(ActionSheet, {
    title: "Miembros de la lista",
    actions: [{
      icon: 'user-plus',
      label: 'Invitar por enlace'
    }, {
      icon: 'qr-code',
      label: 'Compartir QR'
    }, {
      icon: 'log-out',
      label: 'Salir de la lista',
      danger: true
    }],
    onClose: () => setSheet(null)
  }), sheet?.kind === 'account' && /*#__PURE__*/React.createElement(ActionSheet, {
    title: "Tu cuenta",
    actions: [{
      icon: 'download',
      label: 'Instalar app'
    }, {
      icon: 'settings',
      label: 'Configuración'
    }, {
      icon: 'moon',
      label: 'Modo oscuro'
    }, {
      icon: 'log-out',
      label: 'Cerrar sesión',
      danger: true
    }],
    onClose: () => setSheet(null)
  }), toast && /*#__PURE__*/React.createElement(Toast, {
    message: toast.message,
    onDismiss: () => setToast(null)
  }));
}
window.App = App;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/components/ActionSheet.jsx
try { (() => {
// ActionSheet — bottom sheet menu, used for item options + list options.
function ActionSheet({
  title,
  actions,
  onClose
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "sheet-overlay",
    onClick: onClose
  }), /*#__PURE__*/React.createElement("div", {
    className: "sheet",
    role: "dialog",
    "aria-modal": "true"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sheet__handle"
  }), title && /*#__PURE__*/React.createElement("div", {
    className: "sheet__title"
  }, title), actions.map((a, idx) => /*#__PURE__*/React.createElement("button", {
    key: idx,
    className: `sheet__row${a.danger ? ' sheet__row--danger' : ''}`,
    onClick: () => {
      a.onClick && a.onClick();
      onClose();
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "sheet__icon"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: a.icon,
    size: 20
  })), a.label))));
}
window.ActionSheet = ActionSheet;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/components/ActionSheet.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/components/DashboardScreen.jsx
try { (() => {
// DashboardScreen — lists overview.
function DashboardScreen({
  lists,
  onOpenList,
  onMenu,
  onAvatar
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("header", {
    className: "app-header"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "app-header__title"
  }, /*#__PURE__*/React.createElement(Wordmark, {
    size: 26
  })), /*#__PURE__*/React.createElement("button", {
    className: "app-header__action",
    "aria-label": "Buscar"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 20
  })), /*#__PURE__*/React.createElement("button", {
    className: "app-header__avatar",
    style: {
      background: '#1F3A8A'
    },
    onClick: onAvatar,
    "aria-label": "Tu cuenta"
  }, "M")), /*#__PURE__*/React.createElement("main", {
    className: "dashboard"
  }, lists.map(list => /*#__PURE__*/React.createElement(ListCard, {
    key: list.id,
    list: list,
    onOpen: () => onOpenList(list.id),
    onMenu: () => onMenu(list.id)
  })), /*#__PURE__*/React.createElement("button", {
    className: "create-list",
    onClick: () => onMenu('__new')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 18
  }), "Nueva lista")));
}
function ListCard({
  list,
  onOpen,
  onMenu
}) {
  const total = list.items.length;
  const purchased = list.items.filter(i => i.purchased).length;
  const pct = total === 0 ? 0 : Math.round(purchased / total * 100);
  return /*#__PURE__*/React.createElement("div", {
    className: "list-card"
  }, /*#__PURE__*/React.createElement("span", {
    className: "list-card__drag",
    "aria-hidden": true
  }, "\u283F"), /*#__PURE__*/React.createElement("button", {
    className: "list-card__emoji",
    "aria-label": "Cambiar emoji"
  }, list.emoji), /*#__PURE__*/React.createElement("button", {
    className: "list-card__main",
    onClick: onOpen
  }, /*#__PURE__*/React.createElement("span", {
    className: "list-card__title"
  }, list.name), total > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "list-card__bar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "list-card__fill",
    style: {
      width: `${pct}%`,
      background: pct === 100 ? 'var(--verde-0)' : undefined
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "list-card__sub"
  }, purchased, " de ", total, " comprados")), total === 0 && /*#__PURE__*/React.createElement("span", {
    className: "list-card__sub"
  }, "vac\xEDa \xB7 a\xF1ade lo primero")), /*#__PURE__*/React.createElement("button", {
    className: "list-card__menu",
    onClick: e => {
      e.stopPropagation();
      onMenu();
    },
    "aria-label": "Opciones"
  }, "\u22EF"));
}
window.DashboardScreen = DashboardScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/components/DashboardScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/components/Icon.jsx
try { (() => {
/* global lucide, React */
// Small wrapper around Lucide. Renders an inline SVG <i> tag and
// runs lucide.createIcons() on each render so the icon paints.
function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  color,
  style
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      window.lucide.createIcons({
        attrs: {
          'stroke-width': strokeWidth,
          width: size,
          height: size
        },
        nameAttr: 'data-lucide',
        // Only create icons within this node
        // eslint-disable-next-line
        ...(typeof lucide.createIcons === 'function' ? {} : {})
      });
    }
  });
  return /*#__PURE__*/React.createElement("i", {
    ref: ref,
    "data-lucide": name,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      color: color || 'currentColor',
      ...style
    }
  });
}
window.Icon = Icon;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/components/Icon.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/components/ListScreen.jsx
try { (() => {
// ListScreen — main list editing surface.
function ListScreen({
  list,
  members,
  stores,
  onBack,
  onMenu,
  onToggle,
  onItemMenu,
  onAddItem
}) {
  const [filter, setFilter] = React.useState('Todas');
  const [showSuggestion, setShowSuggestion] = React.useState(true);
  const [inputValue, setInputValue] = React.useState('');
  const filtered = filter === 'Todas' ? list.items : list.items.filter(i => i.stores.includes(filter));
  const total = filtered.length;
  const purchased = filtered.filter(i => i.purchased).length;
  const pct = total === 0 ? 0 : Math.round(purchased / total * 100);
  const memberMap = new Map(members.map(m => [m.id, m]));
  const pendingItems = filtered.filter(i => !i.purchased);
  const purchasedItems = filtered.filter(i => i.purchased);
  const pendingTotal = pendingItems.reduce((s, i) => s + (i.price || 0) * (i.pricePer === 'KILOGRAM' ? parseFloat(i.qty) || 0 : 1), 0);
  const purchasedTotal = purchasedItems.reduce((s, i) => s + (i.price || 0) * (i.pricePer === 'KILOGRAM' ? parseFloat(i.qty) || 0 : 1), 0);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("header", {
    className: "app-header"
  }, /*#__PURE__*/React.createElement("button", {
    className: "app-header__back",
    onClick: onBack
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-left",
    size: 20
  }), " Listas"), /*#__PURE__*/React.createElement("h1", {
    className: "app-header__title app-header__title--listname"
  }, /*#__PURE__*/React.createElement("span", {
    className: "emoji"
  }, list.emoji), list.name), /*#__PURE__*/React.createElement("button", {
    className: "app-header__action",
    onClick: onMenu,
    "aria-label": "Miembros"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users",
    size: 20
  }))), /*#__PURE__*/React.createElement("div", {
    className: "progress"
  }, /*#__PURE__*/React.createElement("div", {
    className: "progress__fill",
    style: {
      width: pct + '%',
      background: pct === 100 ? 'var(--verde-0)' : undefined
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "filter-bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "filter-chip filter-chip--search",
    "aria-label": "Buscar"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 16
  })), ['Todas', ...stores].map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    className: `filter-chip${filter === s ? ' filter-chip--active' : ''}`,
    onClick: () => setFilter(s)
  }, s))), /*#__PURE__*/React.createElement("div", {
    className: "totals-row"
  }, /*#__PURE__*/React.createElement("span", null, "Pendiente ", /*#__PURE__*/React.createElement("span", {
    className: "amt"
  }, "\u20AC ", pendingTotal.toFixed(2).replace('.', ','))), /*#__PURE__*/React.createElement("span", null, "Comprado ", /*#__PURE__*/React.createElement("span", {
    className: "amt",
    style: {
      color: 'var(--verde-0)'
    }
  }, "\u20AC ", purchasedTotal.toFixed(2).replace('.', ',')))), /*#__PURE__*/React.createElement("div", {
    className: "item-list"
  }, filtered.map(item => /*#__PURE__*/React.createElement(ItemRow, {
    key: item.id,
    item: item,
    member: memberMap.get(item.by),
    onToggle: () => onToggle(item.id),
    onMenu: () => onItemMenu(item.id)
  }))), /*#__PURE__*/React.createElement(SmartInput, {
    value: inputValue,
    onChange: setInputValue,
    showSuggestion: showSuggestion,
    onDismissSuggestion: () => setShowSuggestion(false),
    onAddSuggestion: () => {
      onAddItem('Leche entera');
      setShowSuggestion(false);
    },
    onSubmit: () => {
      if (inputValue.trim()) {
        onAddItem(inputValue.trim());
        setInputValue('');
      }
    }
  }));
}
function ItemRow({
  item,
  member,
  onToggle,
  onMenu
}) {
  const fmtPrice = (p, per) => {
    if (p == null) return null;
    const s = `€ ${p.toFixed(2).replace('.', ',')}`;
    return per === 'KILOGRAM' ? `${s} / kg` : s;
  };
  return /*#__PURE__*/React.createElement("div", {
    className: `item${item.purchased ? ' item--purchased' : ''}`
  }, /*#__PURE__*/React.createElement("button", {
    className: `check${item.purchased ? ' check--on' : ''}`,
    role: "checkbox",
    "aria-checked": item.purchased,
    onClick: onToggle,
    "aria-label": item.purchased ? 'Marcar como no comprado' : 'Marcar como comprado'
  }), /*#__PURE__*/React.createElement("div", {
    className: "item__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "item__name-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "item__name"
  }, item.name), item.qty && /*#__PURE__*/React.createElement("span", {
    className: "item__qty"
  }, item.qty)), /*#__PURE__*/React.createElement("div", {
    className: "item__tags"
  }, item.brand && /*#__PURE__*/React.createElement("button", {
    className: "item-tag"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "tag",
    size: 11
  }), " ", item.brand), item.stores.map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    className: "item-tag"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "store",
    size: 11
  }), " ", s)), item.price != null ? /*#__PURE__*/React.createElement("button", {
    className: "item-tag item-tag--price"
  }, fmtPrice(item.price, item.pricePer)) : !item.purchased && /*#__PURE__*/React.createElement("button", {
    className: "item-tag item-tag--cta"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 11
  }), " precio"), !item.brand && !item.purchased && /*#__PURE__*/React.createElement("button", {
    className: "item-tag item-tag--cta"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 11
  }), " marca"), item.stores.length === 0 && !item.purchased && /*#__PURE__*/React.createElement("button", {
    className: "item-tag item-tag--cta"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 11
  }), " tienda"))), /*#__PURE__*/React.createElement("div", {
    className: "item__right"
  }, (() => {
    const isSelf = member.id === 'u1';
    const avatarStyle = isSelf ? {
      background: 'var(--tinta-0)',
      color: 'var(--accent-fg)'
    } : {
      background: 'var(--paper-2)',
      color: 'var(--ink-1)'
    };
    return /*#__PURE__*/React.createElement("div", {
      className: "item__avatar",
      style: avatarStyle
    }, member.initial);
  })(), /*#__PURE__*/React.createElement("button", {
    className: "item__menu",
    onClick: e => {
      e.stopPropagation();
      onMenu();
    },
    "aria-label": "Opciones"
  }, "\u22EF")));
}
function SmartInput({
  value,
  onChange,
  onSubmit,
  showSuggestion,
  onAddSuggestion,
  onDismissSuggestion
}) {
  const parsed = React.useMemo(() => {
    // toy parser for preview only
    const tokens = value.split(/\s+/);
    const out = {
      name: [],
      qty: null,
      brand: null,
      stores: [],
      price: null
    };
    tokens.forEach(t => {
      if (!t) return;
      if (t.startsWith('#')) out.brand = t.slice(1) || null;else if (t.startsWith('@')) {
        const s = t.slice(1);
        if (s) out.stores.push(s);
      } else if (t.startsWith('+')) out.qty = t.slice(1) || null;else if (t.startsWith('$')) {
        const n = parseFloat(t.slice(1).replace(',', '.'));
        if (!isNaN(n)) out.price = n;
      } else out.name.push(t);
    });
    out.name = out.name.join(' ').trim();
    return out;
  }, [value]);
  const hasSigil = parsed.qty || parsed.brand || parsed.stores.length || parsed.price != null;
  const hasName = parsed.name.length > 0;
  const sigils = [{
    sigil: '+',
    label: 'cant.'
  }, {
    sigil: '#',
    label: 'marca'
  }, {
    sigil: '@',
    label: 'tienda'
  }, {
    sigil: '$',
    label: 'precio'
  }, {
    sigil: '|',
    label: 'cód.'
  }];
  const insertSigil = s => {
    const next = value && !value.endsWith(' ') ? value + ' ' + s : value + s;
    onChange(next);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "smart-input"
  }, showSuggestion && /*#__PURE__*/React.createElement("div", {
    className: "suggestion-banner"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 20
    }
  }, "\uD83C\uDF3F"), /*#__PURE__*/React.createElement("span", {
    className: "text"
  }, "Sueles comprar ", /*#__PURE__*/React.createElement("b", null, "leche entera"), " los jueves."), /*#__PURE__*/React.createElement("button", {
    className: "add",
    onClick: onAddSuggestion
  }, "A\xF1adir"), /*#__PURE__*/React.createElement("button", {
    onClick: onDismissSuggestion,
    "aria-label": "Descartar",
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--fg-subtle)',
      padding: 2
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16
  }))), hasSigil && /*#__PURE__*/React.createElement("div", {
    className: "input-preview"
  }, hasName ? /*#__PURE__*/React.createElement("span", {
    className: "name"
  }, parsed.name) : /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--tomate-0)'
    }
  }, "Sin nombre"), parsed.qty && /*#__PURE__*/React.createElement("span", {
    className: "qty"
  }, parsed.qty), parsed.brand && /*#__PURE__*/React.createElement("span", {
    className: "ptag"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "tag",
    size: 11
  }), " ", parsed.brand), parsed.stores.map(s => /*#__PURE__*/React.createElement("span", {
    key: s,
    className: "ptag"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "store",
    size: 11
  }), " ", s)), parsed.price != null && /*#__PURE__*/React.createElement("span", {
    className: "ptag"
  }, "\u20AC ", parsed.price.toFixed(2).replace('.', ','))), /*#__PURE__*/React.createElement("div", {
    className: "legend"
  }, sigils.map(({
    sigil,
    label
  }) => /*#__PURE__*/React.createElement("button", {
    key: sigil,
    className: "legend__chip",
    onClick: () => insertSigil(sigil)
  }, /*#__PURE__*/React.createElement("b", null, sigil), label))), /*#__PURE__*/React.createElement("div", {
    className: "input-row"
  }, /*#__PURE__*/React.createElement("input", {
    className: "input-row__input",
    placeholder: "A\xF1adir producto\u2026",
    value: value,
    onChange: e => onChange(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter' && hasName) onSubmit();
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "input-row__scan",
    "aria-label": "Escanear"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "scan-line",
    size: 18
  })), /*#__PURE__*/React.createElement("button", {
    className: "input-row__add",
    onClick: onSubmit,
    disabled: !hasName,
    "aria-label": "A\xF1adir"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 20
  }))));
}
window.ListScreen = ListScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/components/ListScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/components/SignInScreen.jsx
try { (() => {
// SignInScreen — mascot, wordmark, single CTA.
function SignInScreen({
  onSignIn
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "signin"
  }, /*#__PURE__*/React.createElement("img", {
    className: "signin__mascot",
    src: "../../assets/mascot.png",
    alt: ""
  }), /*#__PURE__*/React.createElement("div", {
    className: "signin__hand"
  }, "\xA1a por ello!"), /*#__PURE__*/React.createElement("h1", {
    className: "signin__title"
  }, /*#__PURE__*/React.createElement(Wordmark, {
    size: 56
  })), /*#__PURE__*/React.createElement("p", {
    className: "signin__tag"
  }, "Lista de la compra compartida.", /*#__PURE__*/React.createElement("br", null), "Sencilla. Para toda la familia."), /*#__PURE__*/React.createElement("button", {
    className: "signin__cta",
    onClick: onSignIn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "log-in",
    size: 18
  }), "Continuar con Google"), /*#__PURE__*/React.createElement("p", {
    className: "signin__legal"
  }, "Al continuar aceptas los ", /*#__PURE__*/React.createElement("a", {
    style: {
      color: 'var(--accent)'
    }
  }, "t\xE9rminos"), " y la ", /*#__PURE__*/React.createElement("a", {
    style: {
      color: 'var(--accent)'
    }
  }, "privacidad"), "."));
}
window.SignInScreen = SignInScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/components/SignInScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/components/Toast.jsx
try { (() => {
// Toast — auto-dismissing snack-style confirmation.
function Toast({
  message,
  onUndo,
  onDismiss
}) {
  React.useEffect(() => {
    const id = setTimeout(onDismiss, 4000);
    return () => clearTimeout(id);
  }, [onDismiss]);
  return /*#__PURE__*/React.createElement("div", {
    className: "toast",
    role: "status"
  }, /*#__PURE__*/React.createElement("span", {
    className: "toast__dot"
  }), /*#__PURE__*/React.createElement("span", null, message), onUndo && /*#__PURE__*/React.createElement("button", {
    className: "toast__undo",
    onClick: onUndo
  }, "Deshacer"));
}
window.Toast = Toast;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/components/Toast.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/components/Wordmark.jsx
try { (() => {
// Wordmark — "CarroQueSí" stylized as ONE word, but each of the
// three underlying words in its own brand color (blue / red / green).
function Wordmark({
  size = 32,
  dark = false
}) {
  const tickSize = Math.round(size * 0.55);
  return /*#__PURE__*/React.createElement("span", {
    className: `wordmark${dark ? ' wordmark--dark' : ''}`,
    style: {
      fontSize: size
    },
    "aria-label": "CarroQueS\xED"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wordmark__word wordmark__word--1"
  }, "Carro"), /*#__PURE__*/React.createElement("span", {
    className: "wordmark__word wordmark__word--2"
  }, "Que"), /*#__PURE__*/React.createElement("span", {
    className: "wordmark__word wordmark__word--3"
  }, "S\xED"), /*#__PURE__*/React.createElement("svg", {
    className: "wordmark__tick",
    width: tickSize,
    height: tickSize,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "3.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 12 l6 6 l13 -14"
  })));
}
window.Wordmark = Wordmark;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/components/Wordmark.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/components/mockData.js
try { (() => {
// Static demo data. The kit fakes interactivity but never hits a backend.

const MEMBERS = [{
  id: 'u1',
  initial: 'M',
  color: '#1F3A8A',
  name: 'Marta'
}, {
  id: 'u2',
  initial: 'L',
  color: '#C0392B',
  name: 'Lucía'
}, {
  id: 'u3',
  initial: 'A',
  color: '#3A7A4A',
  name: 'Andrés'
}, {
  id: 'u4',
  initial: 'P',
  color: '#C9941F',
  name: 'Pablo'
}];
const LISTS = [{
  id: 'l1',
  emoji: '🥑',
  name: 'Semana del 12',
  items: [{
    id: 'i1',
    name: 'Aceite de oliva v.e.',
    qty: '1 L',
    brand: 'Hacendado',
    stores: ['Mercadona'],
    price: 6.99,
    pricePer: null,
    purchased: false,
    by: 'u1'
  }, {
    id: 'i2',
    name: 'Tomates pera',
    qty: '2 kg',
    brand: null,
    stores: ['Mercadona'],
    price: 1.89,
    pricePer: 'KILOGRAM',
    purchased: true,
    by: 'u2'
  }, {
    id: 'i3',
    name: 'Leche entera',
    qty: '6 ud',
    brand: null,
    stores: [],
    price: null,
    pricePer: null,
    purchased: false,
    by: 'u3'
  }, {
    id: 'i4',
    name: 'Pan de masa madre',
    qty: null,
    brand: null,
    stores: ['Panadería'],
    price: 3.20,
    pricePer: null,
    purchased: false,
    by: 'u1'
  }, {
    id: 'i5',
    name: 'Plátanos de Canarias',
    qty: '1 kg',
    brand: null,
    stores: ['Mercadona'],
    price: 2.49,
    pricePer: 'KILOGRAM',
    purchased: true,
    by: 'u4'
  }, {
    id: 'i6',
    name: 'Queso curado',
    qty: '300 g',
    brand: 'García Baquero',
    stores: ['Lidl'],
    price: null,
    pricePer: null,
    purchased: false,
    by: 'u1'
  }, {
    id: 'i7',
    name: 'Café molido',
    qty: null,
    brand: 'Marcilla',
    stores: ['Carrefour'],
    price: 4.10,
    pricePer: null,
    purchased: false,
    by: 'u2'
  }, {
    id: 'i8',
    name: 'Pasta integral',
    qty: '500 g',
    brand: null,
    stores: ['Mercadona'],
    price: null,
    pricePer: null,
    purchased: false,
    by: 'u3'
  }]
}, {
  id: 'l2',
  emoji: '🎉',
  name: 'Cumple de Lucía',
  items: [{
    id: 'b1',
    name: 'Tarta de chocolate',
    qty: null,
    brand: null,
    stores: ['Panadería'],
    price: 18.50,
    pricePer: null,
    purchased: true,
    by: 'u1'
  }, {
    id: 'b2',
    name: 'Velas',
    qty: null,
    brand: null,
    stores: ['Tiger'],
    price: 2.99,
    pricePer: null,
    purchased: true,
    by: 'u2'
  }, {
    id: 'b3',
    name: 'Refrescos',
    qty: '6 ud',
    brand: null,
    stores: ['Mercadona'],
    price: 4.20,
    pricePer: null,
    purchased: true,
    by: 'u1'
  }]
}, {
  id: 'l3',
  emoji: '🌮',
  name: 'Tacos viernes',
  items: [{
    id: 't1',
    name: 'Tortillas de maíz',
    qty: null,
    brand: 'Bimbo',
    stores: ['Carrefour'],
    price: null,
    pricePer: null,
    purchased: false,
    by: 'u3'
  }, {
    id: 't2',
    name: 'Aguacates',
    qty: '4 ud',
    brand: null,
    stores: ['Mercadona'],
    price: 1.20,
    pricePer: null,
    purchased: false,
    by: 'u3'
  }, {
    id: 't3',
    name: 'Cilantro fresco',
    qty: null,
    brand: null,
    stores: ['Mercadona'],
    price: null,
    pricePer: null,
    purchased: false,
    by: 'u4'
  }]
}];
const STORES_BY_LIST = {
  l1: ['Mercadona', 'Lidl', 'Carrefour', 'Panadería'],
  l2: ['Panadería', 'Tiger', 'Mercadona'],
  l3: ['Mercadona', 'Carrefour']
};
window.CARRO_DATA = {
  MEMBERS,
  LISTS,
  STORES_BY_LIST
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/components/mockData.js", error: String((e && e.message) || e) }); }

// ui_kits/app/ios-frame.jsx
try { (() => {
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports: IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ios-frame.jsx", error: String((e && e.message) || e) }); }

})();
