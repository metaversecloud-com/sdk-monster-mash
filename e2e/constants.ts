export const APP_PORT = Number(process.env.APP_PORT || 3100);
export const MOCK_TOPIA_PORT = Number(process.env.MOCK_TOPIA_PORT || 3101);
export const MOCK_TOPIA_URL = `http://localhost:${MOCK_TOPIA_PORT}`;
export const INTERACTIVE_KEY = "e2e-public-key";
// Distinctive on purpose: the platform tests fail if this string ever reaches the browser.
export const INTERACTIVE_SECRET = "e2e-interactive-secret-must-never-leak";
// mock-topia's fake S3 bucket. Not a valid DNS name on purpose, so the AWS SDK uses path-style URLs.
export const S3_BUCKET = "sdk_monster_mash_e2e";
