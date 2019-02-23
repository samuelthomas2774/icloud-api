require('./authenticate').default.then(async icloud => {
    console.log('Storage usage', await icloud.getStorageUsage());
});
