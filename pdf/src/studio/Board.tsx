import { useState, type CSSProperties, type MouseEvent } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStudio } from '../lib/store';
import type { Page, Source } from '../lib/pdf';
import { Thumb } from './Thumb';
import { Icon } from './Icon';

export function Board({ compact = false, onPreview }: { compact?: boolean; onPreview: (id: string) => void }) {
  const pages = useStudio((s) => s.pages);
  const sources = useStudio((s) => s.sources);
  const selected = useStudio((s) => s.selected);
  const move = useStudio((s) => s.move);
  const [active, setActive] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  const dragging = active ? (selected.includes(active) ? selected : [active]) : [];

  const onStart = (e: DragStartEvent) => setActive(String(e.active.id));
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    if (!e.over) return;
    const ids = pages.filter((p) => dragging.includes(p.id)).map((p) => p.id);
    if (e.over.id !== e.active.id || ids.length > 1) move(ids, String(e.over.id));
  };

  const activePage = active ? pages.find((p) => p.id === active) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onStart}
      onDragEnd={onEnd}
      onDragCancel={() => setActive(null)}
    >
      <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
        <ol className={`board${compact ? ' is-compact' : ''}`} aria-label="페이지 목록">
          {pages.map((p, i) => (
            <Card
              key={p.id}
              page={p}
              n={i + 1}
              source={p.src ? sources[p.src] : undefined}
              selected={selected.includes(p.id)}
              ghost={active !== null && dragging.includes(p.id) && p.id !== active}
              compact={compact}
              onPreview={onPreview}
            />
          ))}
        </ol>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
        {activePage ? (
          <div className={`card is-overlay${compact ? ' is-compact' : ''}`}>
            <Thumb page={activePage} source={activePage.src ? sources[activePage.src] : undefined} />
            {dragging.length > 1 && <span className="card-count">{dragging.length}</span>}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Card({
  page,
  n,
  source,
  selected,
  ghost,
  compact,
  onPreview,
}: {
  page: Page;
  n: number;
  source?: Source;
  selected: boolean;
  ghost: boolean;
  compact: boolean;
  onPreview: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const select = useStudio((s) => s.select);
  const rotate = useStudio((s) => s.rotate);
  const remove = useStudio((s) => s.remove);
  const duplicate = useStudio((s) => s.duplicate);

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    ['--hue' as string]: source?.hue ?? 0,
  };

  const onClick = (e: MouseEvent) => {
    if (e.shiftKey) select(page.id, 'range');
    else select(page.id, 'toggle');
  };
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const label = `${n}페이지${source ? `, ${source.name} ${page.index + 1}쪽` : ', 빈 페이지'}${page.rot ? `, ${page.rot}도 회전` : ''}`;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`card${selected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}${ghost ? ' is-ghost' : ''}${compact ? ' is-compact' : ''}`}
      {...attributes}
      {...listeners}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      onDoubleClick={() => onPreview(page.id)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === 'Enter') select(page.id, 'toggle');
      }}
    >
      <div className="card-sheet">
        <Thumb page={page} source={source} />
        <span className="card-check" aria-hidden>
          <Icon name="check" size={13} />
        </span>
        <div className="card-tools" onPointerDown={(e) => e.stopPropagation()}>
          {!compact && (
            <>
              <button title="왼쪽으로 돌리기" onClick={stop(() => rotate([page.id], -90))}>
                <Icon name="rotl" />
              </button>
              <button title="오른쪽으로 돌리기" onClick={stop(() => rotate([page.id], 90))}>
                <Icon name="rotr" />
              </button>
              <button title="크게 보기" onClick={stop(() => onPreview(page.id))}>
                <Icon name="zoom" />
              </button>
              <button title="복제" onClick={stop(() => duplicate([page.id]))}>
                <Icon name="copy" />
              </button>
            </>
          )}
          <button title="지우기" className="is-danger" onClick={stop(() => remove([page.id]))}>
            <Icon name="trash" />
          </button>
        </div>
      </div>
      <div className="card-meta">
        <span className="card-n">{n}</span>
        {!compact && (
          <span className="card-src" title={source ? `${source.name} · ${page.index + 1}쪽` : '빈 페이지'}>
            <i />
            {source ? `${source.name} ${page.index + 1}` : '빈 페이지'}
          </span>
        )}
      </div>
    </li>
  );
}
