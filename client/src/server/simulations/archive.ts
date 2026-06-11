import "server-only";

import { env } from "~/env";
import type { SimulationArchivePayload } from "./model";
import { simulationArchiveKey } from "./model";

interface R2BucketLike {
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
}

interface CloudflareEnvWithArchive {
  SIM_ARCHIVE?: R2BucketLike;
}

async function getR2ArchiveBucket(): Promise<R2BucketLike | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env: cfEnv } = await getCloudflareContext({ async: true });
    return (cfEnv as CloudflareEnvWithArchive).SIM_ARCHIVE ?? null;
  } catch {
    return null;
  }
}

async function putLocalS3Archive(key: string, body: string): Promise<boolean> {
  if (
    !env.S3_ENDPOINT ||
    !env.S3_ACCESS_KEY_ID ||
    !env.S3_SECRET_ACCESS_KEY ||
    !env.S3_BUCKET
  ) {
    return false;
  }

  const { PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: "auto",
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
  });

  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: "application/json",
    }),
  );
  return true;
}

export async function archiveSimulationPayload(
  simulationId: string,
  payload: SimulationArchivePayload,
): Promise<string | null> {
  const key = simulationArchiveKey(simulationId);
  const body = JSON.stringify(payload, null, 2);

  const r2 = await getR2ArchiveBucket();
  if (r2) {
    await r2.put(key, body, {
      httpMetadata: { contentType: "application/json" },
    });
    return key;
  }

  if (await putLocalS3Archive(key, body)) {
    return key;
  }

  return null;
}
