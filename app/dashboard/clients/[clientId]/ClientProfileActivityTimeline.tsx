"use client";

import React, { useMemo } from "react";
import { Activity, ChevronRight, Clock3 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  ACTIVITY_FILTERS,
  ACTIVITY_RANGES,
  activityIcon,
  FilterRail,
  type ActivityFilter,
  type ActivityItem,
  type ActivityRange,
} from "./ClientProfileSupport";

type ClientProfileActivityTimelineProps = {
  activityWindowHelpText: string;
  activityEmptyText: string;
  activitiesTotal: number;
  activityRange: ActivityRange;
  setActivityRange: (range: ActivityRange) => void;
  activityFilter: ActivityFilter;
  setActivityFilter: (filter: ActivityFilter) => void;
  activityError: string | null;
  activityLoading: boolean;
  activityLoadingMore: boolean;
  activityHasMore: boolean;
  filteredActivities: ActivityItem[];
  loadMoreActivities: () => void;
  getActivityFyChip: (activity: ActivityItem) => { label: string; className: string };
  getActivityActionLabel: (activity: ActivityItem) => string | null;
  handleActivityAction: (activity: ActivityItem) => void;
};

export default function ClientProfileActivityTimeline({
  activityWindowHelpText,
  activityEmptyText,
  activitiesTotal,
  activityRange,
  setActivityRange,
  activityFilter,
  setActivityFilter,
  activityError,
  activityLoading,
  activityLoadingMore,
  activityHasMore,
  filteredActivities,
  loadMoreActivities,
  getActivityFyChip,
  getActivityActionLabel,
  handleActivityAction,
}: ClientProfileActivityTimelineProps) {
  const groupedActivities = useMemo(() => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const dateKey = (value: Date) => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
    const todayKey = dateKey(today);
    const yesterdayKey = dateKey(yesterday);
    const groups = new Map<string, { label: string; events: ActivityItem[] }>();

    filteredActivities.forEach((event) => {
      const date = new Date(event.date);
      const key = dateKey(date);
      const label = key === todayKey
        ? "Today"
        : key === yesterdayKey
          ? "Yesterday"
          : new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(date);
      const group = groups.get(key) || { label, events: [] };
      group.events.push(event);
      groups.set(key, group);
    });

    return Array.from(groups.values());
  }, [filteredActivities]);
  const formatActivityTime = (value: string) => new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

  return (
    <div className="client-profile-card client-profile-activity-card overflow-hidden !p-0">
      <div className="client-profile-activity-header">
        <div className="client-profile-activity-heading">
          <span><Clock3 className="h-4 w-4" /></span>
          <div>
            <p className="client-profile-kicker">Client History</p>
            <h2>Activity Timeline</h2>
            <small>{activityWindowHelpText}</small>
          </div>
          <em>{activitiesTotal.toLocaleString("en-IN")} events</em>
        </div>
        <div className="client-profile-activity-filters">
            <FilterRail
              label="Window"
              value={activityRange}
              options={ACTIVITY_RANGES}
              onChange={setActivityRange}
              tone="neutral"
              dense
            />
            <FilterRail
              label="Type"
              value={activityFilter}
              options={ACTIVITY_FILTERS}
              onChange={setActivityFilter}
              tone="neutral"
              dense
            />
        </div>
      </div>

      <>
          {activityError ? (
            <div className="px-5 py-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                {activityError}
              </div>
            </div>
          ) : activityLoading ? (
            <div className="py-10 flex items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Activity className="w-4 h-4 text-brand-600 mx-auto" />
              <p className="font-semibold text-default mt-3 mb-1">No activity for this filter</p>
              <p className="text-sm text-muted">{activityEmptyText}.</p>
            </div>
          ) : (
            <div className="client-profile-activity-groups">
              {groupedActivities.map((group, groupIndex) => (
                <section key={group.label} className="client-profile-activity-group" data-current={groupIndex === 0 && group.label === "Today" ? "true" : undefined}>
                  <h3>{group.label}<span>{group.events.length}</span></h3>
                  <div className="client-profile-activity-list">
                    {group.events.map((event, eventIndex) => {
                      const actionLabel = getActivityActionLabel(event);
                      const fyChip = getActivityFyChip(event);
                      const showStatusBadge = Boolean(event.badge && event.badge !== "Document");
                      const content = (
                        <>
                          <span className="client-profile-activity-icon" data-color={event.color}>{activityIcon(event.type)}</span>
                          <div className="client-profile-activity-copy">
                            <div>
                              <strong>{event.label}</strong>
                              <time dateTime={event.date}>{formatActivityTime(event.date)}</time>
                            </div>
                            <p>{event.detail}</p>
                            <div className="client-profile-activity-meta">
                              <span className="client-profile-activity-badges">
                                {event.financialYear && <i className={fyChip.className}>{fyChip.label}</i>}
                                {showStatusBadge && <i className={event.badgeColor || "bg-surface text-muted"}>{event.badge}</i>}
                              </span>
                            <small>{formatDate(event.date)}{actionLabel ? ` · ${actionLabel}` : ""}</small>
                            {event.actorEmail && <small>Updated by {event.actorEmail}</small>}
                            </div>
                          </div>
                          {actionLabel && <ChevronRight className="client-profile-activity-chevron h-4 w-4" />}
                        </>
                      );
                      return actionLabel ? (
                        <button key={event.id} type="button" style={{ "--activity-index": eventIndex } as React.CSSProperties} onClick={() => handleActivityAction(event)}>{content}</button>
                      ) : (
                        <div key={event.id} style={{ "--activity-index": eventIndex } as React.CSSProperties}>{content}</div>
                      );
                    })}
                  </div>
                </section>
              ))}
              <div className="client-profile-activity-footer">
                {activityLoadingMore ? (
                  <LoadingSpinner />
                ) : activityHasMore ? (
                  <button type="button" className="client-profile-secondary-button" onClick={loadMoreActivities}>Load more activity</button>
                ) : (
                  <span>You&apos;ve reached the end of this activity history.</span>
                )}
              </div>
            </div>
          )}
      </>
    </div>
  );
}
