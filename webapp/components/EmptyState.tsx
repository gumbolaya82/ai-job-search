/**
 * A guided empty state.
 *
 * An italic "nothing here yet" reported the state and left you there. Every
 * empty region in this app has exactly one thing that fills it — a command, a
 * button, a filter to clear — so the panel names that thing and carries it.
 *
 * No "use client": it renders nothing interactive itself, and takes whatever
 * control the caller passes as `children`.
 */
export default function EmptyState({
  title,
  body,
  children,
  small = false,
}: {
  title: string;
  body?: React.ReactNode;
  /** The control that fills it: a CopyCommand, a button, a link. */
  children?: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div className={`guide${small ? " sm" : ""}`}>
      <b>{title}</b>
      {body && <p>{body}</p>}
      {children && <div className="acts">{children}</div>}
    </div>
  );
}
