require('./authenticate').default.then(async icloud => {
    console.log('Device details', await icloud.getDeviceDetails());
});
