require('./authenticate').default.then(async icloud => {
    const drive = icloud.drive;

    // console.log('iCloud Drive service', drive);

    const root = await drive['com.apple.CloudDocs'];

    console.log('com.apple.CloudDocs', root);

    const libraries = await drive.getAppLibraries();

    console.log('Libraries', libraries);

    console.log('Root directory response', await root.folder);

    const firstItemInRoot = (await root.items)[0];

    console.log('First item in root directory', firstItemInRoot);

    console.log('All item paths', await root.listAllItems());
});
