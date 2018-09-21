const iCloudService = require('..').default;

exports.default = (async () => {
    const icloud = new iCloudService('apple-id', 'password');

    const response = await icloud.authenticate();

    // console.log(icloud, response);

    return icloud;
})();
