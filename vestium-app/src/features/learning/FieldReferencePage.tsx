import { Navigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { useTheme } from '../../lib/training-core/ThemeContext';

// Supports both the static theme format (items/subsections) and the backend-generated
// format (checklist/purpose/preventsMistake). Both render the same card UI.
type FieldRefCard = {
  id?: string;
  title: string;
  type?: 'checklist' | 'prose' | 'comparison';
  // Static format
  items?: string[];
  subsections?: Array<{ heading: string; content: string; note?: string }>;
  // Backend-generated format
  checklist?: string[];
  purpose?: string;
  preventsMistake?: string;
};

export const FieldReferencePage = () => {
  const { currentTheme } = useTheme();
  const cards = (currentTheme.simulatorData?.fieldReferenceCards ?? []) as FieldRefCard[];

  // Show page when cards exist — no simulator dependency check for reference material
  if (cards.length === 0) return <Navigate to={`/${currentTheme.id}/dashboard`} replace />;

  const pageTitle = currentTheme.labels?.fieldReferenceTitle ?? 'Field Reference';

  return (
    <div className="space-y-4">
      <Card title={pageTitle}>
        <p className="text-sm text-theme-secondary">
          Quick job-side reference cards for this module. Ungated — available throughout training.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card, idx) => {
          // Normalise: backend format uses `checklist` instead of `items`
          const listItems: string[] = card.items ?? card.checklist ?? [];
          const cardKey = card.id ?? card.title ?? String(idx);

          return (
            <Card key={cardKey} title={card.title}>
              {/* Purpose subtitle (backend-generated cards) */}
              {card.purpose ? (
                <p className="mb-3 text-xs text-theme-secondary">{card.purpose}</p>
              ) : null}

              {/* Prose with subsections (static format) */}
              {card.type === 'prose' && card.subsections ? (
                <div className="space-y-3 text-xs text-theme-secondary">
                  {card.subsections.map((sub) => (
                    <div key={sub.heading} className="rounded border border-theme-border bg-theme-base p-3">
                      <p className="font-semibold text-amber-300">{sub.heading}</p>
                      <p className="mt-1">{sub.content}</p>
                      {sub.note ? <p className="mt-1 text-theme-secondary">{sub.note}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                /* Checklist (both formats) */
                <ol className="space-y-2 text-xs text-theme-text">
                  {listItems.map((item, itemIdx) => (
                    <li
                      key={item}
                      className="rounded border border-theme-border bg-theme-base px-2 py-2"
                    >
                      {itemIdx + 1}. {item}
                    </li>
                  ))}
                </ol>
              )}

              {/* Mistake prevention note (backend-generated cards) */}
              {card.preventsMistake ? (
                <div className="mt-3 rounded border border-amber-500/20 bg-amber-500/5 p-2 text-xs">
                  <p className="font-semibold text-amber-300">Common mistake prevented:</p>
                  <p className="mt-1 text-theme-secondary">{card.preventsMistake}</p>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
