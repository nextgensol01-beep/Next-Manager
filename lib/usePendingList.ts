"use client";
import { useState, useCallback, useRef } from "react";

export type PendingStatus = "pending" | "error" | "confirmed";

export type WithPending<T> = T & {
  _status?: PendingStatus;
  _tempId?: string;
};

/**
 * usePendingList
 *
 * Manages a list of records with optimistic-style mutations that show a
 * "pending" state while the API call is in-flight, then either confirm
 * or revert + show error.
 *
 * Flow:
 *   ADD    → item appears instantly with _status:"pending", swapped for
 *            real record on success, removed + error on failure.
 *   EDIT   → item is replaced optimistically with _status:"pending",
 *            confirmed on success, reverted on failure.
 *   DELETE → item gets _status:"pending" (dimmed), removed on success,
 *            reverted on failure.
 */
export function usePendingList<T extends { _id: string }>(initial: T[] = []) {
  const [items, setItems] = useState<WithPending<T>[]>(initial);
  // Keep a ref so callbacks always see latest list without stale closure
  const itemsRef = useRef(items);
  itemsRef.current = items;

  /** Replace the whole list (e.g. after initial fetch) */
  const setAll = useCallback((next: T[]) => {
    setItems(next as WithPending<T>[]);
  }, []);

  /**
   * Optimistically add an item.
   * Returns a commit/rollback pair to call after the API responds.
   */
  const addItem = useCallback((draft: Omit<T, "_id"> & Partial<Pick<T, "_id">>) => {
    const tempId = `_temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimistic = { ...draft, _id: tempId, _status: "pending" } as WithPending<T>;
    setItems((prev) => [...prev, optimistic]);

    const commit = (real: T) => {
      setItems((prev) =>
        prev.map((item) => (item._id === tempId ? ({ ...real, _status: "confirmed" } as WithPending<T>) : item))
      );
      // Fade out "confirmed" badge after 1.5s
      setTimeout(() => {
        setItems((prev) =>
          prev.map((item) => (item._id === real._id ? ({ ...item, _status: undefined } as WithPending<T>) : item))
        );
      }, 1500);
    };

    const rollback = () => {
      setItems((prev) => prev.filter((item) => item._id !== tempId));
    };

    const markError = () => {
      setItems((prev) =>
        prev.map((item) => (item._id === tempId ? ({ ...item, _status: "error" } as WithPending<T>) : item))
      );
    };

    return { tempId, commit, rollback, markError };
  }, []);

  /**
   * Optimistically edit an item.
   * Returns a commit/rollback pair.
   */
  const editItem = useCallback((id: string, patch: Partial<T>) => {
    const original = itemsRef.current.find((item) => item._id === id);
    if (!original) return { commit: () => {}, rollback: () => {}, markError: () => {} };

    setItems((prev) =>
      prev.map((item) =>
        item._id === id ? ({ ...item, ...patch, _status: "pending" } as WithPending<T>) : item
      )
    );

    const commit = (real?: T) => {
      setItems((prev) =>
        prev.map((item) =>
          item._id === id
            ? ({ ...(real ?? item), ...patch, _status: "confirmed" } as WithPending<T>)
            : item
        )
      );
      setTimeout(() => {
        setItems((prev) =>
          prev.map((item) => (item._id === id ? ({ ...item, _status: undefined } as WithPending<T>) : item))
        );
      }, 1500);
    };

    const rollback = () => {
      setItems((prev) =>
        prev.map((item) => (item._id === id ? (original as WithPending<T>) : item))
      );
    };

    const markError = () => {
      setItems((prev) =>
        prev.map((item) =>
          item._id === id ? ({ ...original, _status: "error" } as WithPending<T>) : item
        )
      );
    };

    return { commit, rollback, markError };
  }, []);

  /**
   * Optimistically delete an item (dims it while pending).
   * Returns a commit/rollback pair.
   */
  const deleteItem = useCallback((id: string) => {
    const original = itemsRef.current.find((item) => item._id === id);
    if (!original) return { commit: () => {}, rollback: () => {} };

    setItems((prev) =>
      prev.map((item) =>
        item._id === id ? ({ ...item, _status: "pending" } as WithPending<T>) : item
      )
    );

    const commit = () => {
      setItems((prev) => prev.filter((item) => item._id !== id));
    };

    const rollback = () => {
      setItems((prev) =>
        prev.map((item) => (item._id === id ? (original as WithPending<T>) : item))
      );
    };

    return { commit, rollback };
  }, []);

  return { items, setAll, addItem, editItem, deleteItem };
}
