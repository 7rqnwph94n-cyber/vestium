import { ReactNode } from 'react';
import { cx } from '../utils/classNames';

export const Card = ({
  title,
  children,
  className
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) => (
  <section className={cx('rounded-xl border border-theme-border bg-theme-panel p-4', className)}>
    {title ? <h3 className="mb-3 text-lg font-semibold text-theme-text">{title}</h3> : null}
    {children}
  </section>
);
