import { t as tokenIntercept } from './getSSOTokenFromFile-binktLIt.js';
import { g as fileIntercept } from './index.js';

const externalDataInterceptor = {
    getFileRecord() {
        return fileIntercept;
    },
    interceptFile(path, contents) {
        fileIntercept[path] = Promise.resolve(contents);
    },
    getTokenRecord() {
        return tokenIntercept;
    },
    interceptToken(id, contents) {
        tokenIntercept[id] = contents;
    },
};

export { externalDataInterceptor as e };
//# sourceMappingURL=externalDataInterceptor-BGZM1UTV.js.map
