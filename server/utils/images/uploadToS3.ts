import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Signed S3 client. `PutObject` is restricted to the IAM roles listed in
 * the bucket policy; in deployment the pod's task role (IRSA/ECS task
 * role) supplies credentials automatically via the SDK's default provider
 * chain — same pattern used in `sdk-build-an-asset`.
 *
 * This code path only runs on the finalize-monster action, which is
 * exercised in dev/prod; local runs won't upload unless the developer
 * happens to have creds for one of the allowed roles.
 */
const client = new S3Client({ region: "us-east-1" });

/**
 * Uploads a PNG buffer to the app's S3 bucket at the given key.
 * Returns the public https URL. The bucket + region are baked in:
 *
 *   bucket = process.env.S3_BUCKET  (local dev: topia-dev-test)
 *   region = us-east-1              (matches sdk-build-an-asset)
 *
 * The key is passed by the caller as e.g. `monster-mash/monsters/{id}.png`.
 */
export const uploadPngToS3 = async (buffer: Buffer, key: string): Promise<string> => {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET env is not set — cannot upload composed image");
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: "image/png",
    }),
  );
  return `https://${bucket}.s3.amazonaws.com/${key}`;
};
