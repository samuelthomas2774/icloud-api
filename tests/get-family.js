require('./authenticate').default.then(async icloud => {
    console.log('Family details', await icloud.getFamilyDetails());
});
