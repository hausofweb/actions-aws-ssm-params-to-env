import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { join } from 'path';
import { i as getHomeDir } from './index.js';

const getSSOTokenFilepath = (id) => {
    const hasher = createHash("sha1");
    const cacheName = hasher.update(id).digest("hex");
    return join(getHomeDir(), ".aws", "sso", "cache", `${cacheName}.json`);
};

const tokenIntercept = {};
const getSSOTokenFromFile = async (id) => {
    if (tokenIntercept[id]) {
        return tokenIntercept[id];
    }
    const ssoTokenFilepath = getSSOTokenFilepath(id);
    const ssoTokenText = await readFile(ssoTokenFilepath, "utf8");
    return JSON.parse(ssoTokenText);
};

export { getSSOTokenFromFile as a, getSSOTokenFilepath as g, tokenIntercept as t };
//# sourceMappingURL=getSSOTokenFromFile-binktLIt.js.map
