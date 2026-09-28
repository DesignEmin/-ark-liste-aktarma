"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { MatchResult, PlatformId } from "@/lib/types";
import type { TransferJob } from "./job";

// Tarayıcıdaki IndexedDB:
//  - jobs:       aktarım işleri (devam ettirme için)
//  - matchCache: daha önce eşleştirilmiş şarkılar (aynı şarkı için tekrar arama yapılmaz,
//                özellikle YouTube kotasını korur). Anahtar: "hedef|kaynakKimliği"

interface Schema extends DBSchema {
  jobs: { key: string; value: TransferJob; indexes: { updatedAt: number } };
  matchCache: { key: string; value: { key: string; result: MatchResult; savedAt: number } };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>("muzik-listesi-aktarici", 1, {
      upgrade(database) {
        const jobs = database.createObjectStore("jobs", { keyPath: "id" });
        jobs.createIndex("updatedAt", "updatedAt");
        database.createObjectStore("matchCache", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

export async function saveJob(job: TransferJob): Promise<void> {
  job.updatedAt = Date.now();
  await (await db()).put("jobs", job);
}

export async function loadJob(id: string): Promise<TransferJob | undefined> {
  return (await db()).get("jobs", id);
}

export async function listJobs(): Promise<TransferJob[]> {
  const all = await (await db()).getAllFromIndex("jobs", "updatedAt");
  return all.reverse();
}

export async function deleteJob(id: string): Promise<void> {
  await (await db()).delete("jobs", id);
}

const cacheKey = (target: PlatformId, sourceKey: string) => `${target}|${sourceKey}`;

export async function getCachedMatches(target: PlatformId, keys: string[]): Promise<Map<string, MatchResult>> {
  const database = await db();
  const tx = database.transaction("matchCache", "readonly");
  const out = new Map<string, MatchResult>();
  await Promise.all(
    keys.map(async (k) => {
      const hit = await tx.store.get(cacheKey(target, k));
      if (hit) out.set(k, hit.result);
    }),
  );
  await tx.done;
  return out;
}

export async function putCachedMatches(target: PlatformId, entries: Array<[string, MatchResult]>): Promise<void> {
  const database = await db();
  const tx = database.transaction("matchCache", "readwrite");
  const now = Date.now();
  await Promise.all(entries.map(([k, result]) => tx.store.put({ key: cacheKey(target, k), result, savedAt: now })));
  await tx.done;
}
