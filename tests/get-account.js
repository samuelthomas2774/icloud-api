require('./authenticate').default.then(async icloud => {
    const account = await icloud.account;

    console.log('Account service', account);
});
