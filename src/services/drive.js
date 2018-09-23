
export default class DriveService {
    constructor(service_root, session, qsparams) {
        this.session = session;
        this.qsparams = qsparams;
        this.service_root = service_root;
    }

    static getDriveService(service, service_root) {
        return new DriveService(service_root, service.session, service.qsparams);
    }

    static get Item() {
        return Item;
    }
    static get File() {
        return File;
    }
    static get Directory() {
        return Directory;
    }

    getNodeUrl(id, variant = 'item') {
        return `${this.service_root}/ws/${this.qsparams.dsid}/${variant}/${id}`;
    }

    async getItemByPath(zone, ...path) {
        const root = await this.getZoneRoot(zone);
        return await root.getItemByPath(...path);
    }

    async getItemDetails(id) {
        const items = await this.getItems([id]);
        return items[0];
    }

    async getItems(ids) {
        const response = await this.session.post(this.service_root + '/retrieveItemDetails', this.qsparams, {
            items: ids.map(id => ({
                drivewsid: id,
                partialData: false,
                includeHierarchy: true,
            })),
        });

        return response.items.map(item => Item.createItem(this, item));
    }

    async getItemsInFolder(id) {
        const folders = await this.getItemsInFolders([id]);
        return folders[0];
    }

    async getItemsInFolders(ids) {
        // eslint-disable-next-line max-len
        const response = await this.session.post(this.service_root + '/retrieveItemDetailsInFolders', this.qsparams, ids.map(id => ({
            drivewsid: id,
            partialData: true,
            includeHierarchy: true,
        })));

        return response.map(item => Item.createItem(this, item));
    }

    async getAppLibraries() {
        const response = await this.session.get(this.service_root + '/retrieveAppLibraries', this.qsparams);

        return response.items.map(item => Item.createItem(this, item));
    }

    get libraries() {
        return this._libraries || (this._libraries = this.getAppLibraries());
    }

    async getZoneRoot(id, name = 'root') {
        if (id === 'com.apple.CloudDocs') return this[id];

        const libraries = await this.libraries;
        const library = libraries.find(l => l.zone === id);
        if (library) return library;

        return await this.getItemDetails(`FOLDER::${id}::${name}`);
    }

    get 'com.apple.CloudDocs'() {
        return this._root || (this._root = this.getItemDetails('FOLDER::com.apple.CloudDocs::root'));
    }

    getTrashDetails() {
        return this.session.post(this.service_root + '/retrieveTrashDetails', this.qsparams, {
            includeShallowCount: true,
        });
    }

    get trash() {
        return this.getItemDetails('TRASH_ROOT');
    }
}

class Item {
    constructor(connection, data) {
        this.connection = connection;
        this.data = data;
    }

    static createItem(connection, data) {
        if (data.type === 'APP_LIBRARY') {
            return new AppLibrary(connection, data);
        } else if (data.type === 'FOLDER' && data.drivewsid === 'FOLDER::com.apple.CloudDocs::root') {
            return new Zone(connection, data);
        } else if (data.type === 'FOLDER') {
            return new Directory(connection, data);
        } else if (data.type === 'FILE') {
            return new File(connection, data);
        } else {
            return new Item(connection, data);
        }
    }

    /**
     * The full item ID including the type and zone.
     * drivewsid === `${type}::${zone}::${docwsid}`
     */
    get drivewsid() {
        return this.data.drivewsid;
    }

    /**
     * The item's ID.
     */
    get docwsid() {
        return this.data.docwsid;
    }

    /**
     * The zone ID. This is usually the bundle ID of the app that owns the zone.
     */
    get zone() {
        return this.data.zone;
    }

    /**
     * The item's name.
     */
    get name() {
        return this.data.name;
    }

    // get parent_id() {
    //     return this.data.parentId;
    // }
    //
    // get parent() {
    //     return this.connection.getItemDetails(this.parent_id);
    // }

    /**
     * The item's type.
     * "FOLDER" for folders, "FILE" for files.
     */
    get type() {
        return this.data.type;
    }

    /**
     * I have no idea.
     */
    get etag() {
        return this.data.etag;
    }

    toJSON() {
        return this.data;
    }
}

class Directory extends Item {
    get type() {
        return 'FOLDER';
    }

    get folder() {
        return this._folder || (this._folder =
            this.data.items ? this : this.connection.getItemsInFolder(this.drivewsid));
    }

    get parent_id() {
        return this.folder.then(item => item.data.parentId);
    }

    get parent() {
        return this.parent_id.then(parent_id => this.connection.getItemDetails(parent_id));
    }

    async getItems() {
        // return this._items || (this._items = this.data.items.map(i => Item.createItem(this.connection, i)));

        // const item = this.connection.getItemsInFolder(this.drivewsid);
        const item = await this.folder;

        return await this.connection.getItems(item.data.items.map(item => item.drivewsid));
    }

    get items() {
        return this._items || (this._items = this.getItems());
    }

    get length() {
        return this.folder.then(item => item.numberOfItems);
    }

    async dir() {
        return (await this.items).map(child => child.name);
    }

    async get(name) {
        return (await this.items).find(child => child.name === name);
    }

    async getItemByPath(...path) {
        let current = this;

        for (let name of path) {
            if (!current instanceof Directory) throw new Error('Not a directory');

            current = await current.get(name);
        }

        return current;
    }

    async listAllItems() {
        const items = {};

        for (const item of await this.items) {
            if (item instanceof Directory) {
                items[item.name + '/'] = item;

                const children = await item.listAllItems();

                for (const [key, child] of Object.entries(children)) {
                    items[item.name + '/' + key] = child;
                }
            } else {
                items[item.name] = item;
            }
        }

        return items;
    }
}

class File extends Item {
    get type() {
        return 'FILE';
    }

    get name() {
        return this.filename + (this.extension ? '.' + this.extension : '');
    }

    get filename() {
        return this.data.name;
    }

    get extension() {
        return this.data.extension;
    }

    get size() {
        return this.data.size;
    }

    get date_modified() {
        return new Date(this.data.dateModified);
    }

    get date_changed() {
        return new Date(this.data.dateChanged);
    }

    get date_accessed() {
        return new Date(this.data.lastOpenTime);
    }
}

class Zone extends Directory {}

class AppLibrary extends Zone {
    get max_depth() {
        return this.data.maxDepth;
    }

    get date_created() {
        return new Date(this.data.dateCreated);
    }

    get supported_extensions() {
        return this.data.supportedExtensions;
    }

    get supported_types() {
        return this.data.supportedTypes;
    }
}
