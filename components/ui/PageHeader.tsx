import React from "react";
interface PageHeaderProps { title: string; description?: string; action?: React.ReactNode; children?: React.ReactNode; }
export default function PageHeader({ title, description, action, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
      <div>
        <h1
          className="text-xl md:text-2xl font-bold text-default"
          style={{ letterSpacing: "-0.025em" }}
        >
          {title}
        </h1>
        {description && <p className="text-faint text-sm mt-1">{description}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{action}{children}</div>
    </div>
  );
}
