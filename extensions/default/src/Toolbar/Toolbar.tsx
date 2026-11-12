import React from 'react';
import { useToolbar } from '@ohif/core';

/**
 * Props for the Toolbar component that renders a collection of toolbar buttons and/or button sections.
 *
 * @interface ToolbarProps
 */
interface ToolbarProps {
  /**
   * The section of buttons to display in the toolbar.
   * Common values include 'primary', 'secondary', 'tertiary', etc.
   * Defaults to 'primary' if not specified.
   *
   * @default 'primary'
   */
  buttonSection?: string;

  /**
   * The unique identifier of the viewport this toolbar is associated with.
   */
  viewportId?: string;

  /**
   * The numeric position or location of the toolbar.
   * Used for ordering and layout purposes in the UI.
   */
  location?: number;

  /**
   * Optional labelled groups (button ids in order). Buttons not named in any group go to the last
   * group. Without groups the buttons render flat, as before.
   */
  /** Labelled groups; `prefix` also takes every button whose id starts with it (buttons added at run time). */
  groups?: Array<{ label: string; ids: string[]; prefix?: string }>;
}

export function Toolbar({ buttonSection = 'primary', viewportId, location, groups }: ToolbarProps) {
  const {
    toolbarButtons,
    onInteraction,
    isItemOpen,
    isItemLocked,
    openItem,
    closeItem,
    toggleLock,
  } = useToolbar({
    buttonSection,
  });

  if (!toolbarButtons.length) {
    return null;
  }

  const renderTool = toolDef => {
    if (!toolDef) {
      return null;
    }

    const { id, Component, componentProps } = toolDef;

    // Enhanced props with state and actions - respecting viewport specificity
    const enhancedProps = {
      ...componentProps,
      isOpen: isItemOpen(id, viewportId),
      isLocked: isItemLocked(id, viewportId),
      onOpen: () => openItem(id, viewportId),
      onClose: () => closeItem(id, viewportId),
      onToggleLock: () => toggleLock(id, viewportId),
      viewportId,
    };

    const tool = (
      <Component
        key={id}
        id={id}
        location={location}
        onInteraction={args => {
          onInteraction({
            ...args,
            itemId: id,
            viewportId,
          });
        }}
        {...enhancedProps}
      />
    );

    return (
      <div
        key={id}
        // This wrapper div exists solely for React's key prop requirement during reconciliation.
        // We use display:contents to make it transparent to the layout engine (children appear
        // as direct children of the parent) while keeping it in the DOM for React's virtual DOM.
        className="contents"
      >
        {tool}
      </div>
    );
  };

  if (!groups?.length) {
    return <>{toolbarButtons.map(renderTool)}</>;
  }

  const byId = new Map(toolbarButtons.filter(Boolean).map(def => [def.id, def]));
  const placed = new Set<string>();
  const filled = groups.map(group => {
    const defs = group.ids.map(id => byId.get(id)).filter(Boolean);
    if (group.prefix) {
      defs.push(...toolbarButtons.filter(def => def?.id?.startsWith(group.prefix) && !group.ids.includes(def.id)));
    }
    defs.forEach(def => placed.add(def.id));
    return { label: group.label, defs };
  });
  const rest = toolbarButtons.filter(def => def && !placed.has(def.id));
  filled[filled.length - 1].defs.push(...rest);

  return (
    <>
      {filled
        .filter(group => group.defs.length)
        .map(group => (
          <div
            key={group.label}
            role="group"
            aria-label={group.label}
            className="px-tool-group"
          >
            <div className="px-tool-group-buttons">{group.defs.map(renderTool)}</div>
            <span
              className="px-tool-group-label"
              aria-hidden
            >
              {group.label}
            </span>
          </div>
        ))}
    </>
  );
}
