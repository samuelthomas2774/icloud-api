import path from 'path';

import request from 'request';
import requestPromise from 'request-promise-native';

import {AccountService, UbiquityService, DriveService} from './services';

import FileCookieStore from 'tough-cookie-filestore';

// NOTE - currently the 'cookies.json' file must already exist!
const cookies = request.jar(new FileCookieStore(path.resolve(__dirname, '..', 'data', 'cookies.json')));

export class iCloudSession {
    constructor(service) {
        this.service = service;
    }

    request(method, url, qs, data) {
        return requestPromise({
            url,
            qs,
            method,
            body: data,
            json: true,
            jar: cookies,
            headers: {
                'Origin': this.service.home_endpoint,
                'Referer': this.service.home_endpoint + '/',
                'User-Agent': 'Opera/9.52 (X11; Linux i686; U; en)',
            },
        });
    }

    get(url, qsparams) {
        return this.request('GET', url, qsparams);
    }

    post(url, qsparams, data) {
        return this.request('POST', url, qsparams, data);
    }
}

export default class iCloudService {
    constructor(apple_id, password, options) {
        this.apple_id = apple_id;
        this.password = password;
        this.options = options;

        this.data = {};
        this.client_id = '0000-0000-0000-0000';

        this.home_endpoint = 'https://www.icloud.com';
        this.setup_endpoint = 'https://setup.icloud.com/setup/ws/1';
        this.family_endpoint = 'https://setup.icloud.com/setup/web/family';
        this.device_endpoint = 'https://setup.icloud.com/setup/web/device';

        this.base_login_url = this.setup_endpoint + '/login';

        this.session = new iCloudSession(this);

        this.session.verify = options && options.hasOwnProperty('verify') ? options.verify : true;

        this.qsparams = {
            clientBuildNumber: '17DHotfix5',
            clientMasteringNumber: '17DHotfix5',
            ckjsBuildVersion: '17DProjectDev77',
            ckjsVersion: '2.0.5',
            clientId: this.client_id,
        };
    }

    /**
     * Handles authentication and persists the X-APPLE-WEB-KB cookie so that
     * subsequent logins will not cause additional emails from Apple.
     *
     * @return {Promise<object>}
     */
    async authenticate() {
        console.log('Authenticating as', this.apple_id);

        const data = {
            apple_id: this.apple_id,
            password: this.password,

            // We authenticate every time so remember me is not needed
            extended_login: false,
        };

        const response = await this.session.post(this.base_login_url, this.qsparams, data);

        this.data = response;
        this.qsparams.dsid = response.dsInfo.dsid;

        console.log('Authenticated as', this.ds_info.fullName);

        return response;
    }

    get ds_info() {
        return this.data && this.data.dsInfo;
    }

    get webservices() {
        return this.data && this.data.webservices;
    }

    /**
     * Returns true if two step authentication is required.
     *
     * @return {bool}
     */
    get requires_2sa() {
        return this.data && this.data.hsaChallengeRequired;
    }

    /**
     * Returns devices trusted for two step authentication.
     *
     * @return {Promise}
     */
    getTrustedDevices() {
        return this.session.get(this.setup_endpoint + '/listDevices', this.qsparams);
    }

    /**
     * Requests that a verification code is sent to the given device.
     *
     * @param {object} device
     * @return {Promise}
     */
    sendVerificationCode(device) {
        return this.session.post(this.setup_endpoint + '/sendVerificationCode', this.qsparams, device);
    }

    /**
     * Verifies a verification code received on a trusted device.
     *
     * @param {object} device
     * @param {string} code
     * @return {Promise}
     */
    validateVerificationCode(device, code) {
        return this.session.post(this.setup_endpoint + '/validateVerificationCode', this.qsparams, Object.assign({
            verificationCode: code,
            trustBrowser: true,
        }, device));

        // Later make this reauthenticate
    }

    get account() {
        return this._account || (this._account = AccountService.getAccountService(this, this.webservices.account.url));
    }

    get ubiquity() {
        return this._ubiquity || (this._ubiquity =
            UbiquityService.getUbiquityService(this, this.webservices.ubiquity.url));
    }

    get drive() {
        return this._drive || (this._drive = DriveService.getDriveService(this, this.webservices.drivews.url));
    }

    /**
     * Gets storage usage.
     *
     * @return {Promise<StorageUsageInfo>}
     */
    async getStorageUsage() {
        const response = await this.session.get(this.setup_endpoint + '/storageUsageInfo', this.qsparams);

        return StorageUsageInfo.fromResponse(response);
    }

    /**
     * Gets family details.
     *
     * @return {Promise<FamilyDetails>}
     */
    async getFamilyDetails() {
        const response = await this.session.get(this.family_endpoint + '/getFamilyDetails', this.qsparams);

        return FamilyDetails.fromResponse(response);
    }

    /**
     * Gets device details.
     *
     * @return {Promise<DeviceDetails>}
     */
    async getDeviceDetails() {
        const response = await this.session.get(this.device_endpoint + '/getDevices', this.qsparams);

        return DeviceDetails.fromResponse(response);
    }
}

class StorageUsageInfo {
    constructor(total_storage, used_storage, quota_status, media_types) {
        this.total_storage = total_storage;
        this.used_storage = used_storage;

        this.quota_status = quota_status || new QuotaStatus(this.used_storage > this.total_storage, this.used_storage > this.total_storage, false, false);

        this.media_types = media_types || [];
        this.family_usage = undefined;
    }

    static fromResponse(response) {
        const storage_usage_info = new StorageUsageInfo(
            response.storageUsageInfo.totalStorageInBytes, response.storageUsageInfo.usedStorageInBytes,
            QuotaStatus.fromResponse(response.quotaStatus)
        );

        storage_usage_info.response = response;

        for (let media_type of response.storageUsageByMedia) {
            storage_usage_info.media_types.push(MediaTypeStorageUsageInfo.fromResponse(media_type));
        }

        if (response.familyStorageUsageInfo) {
            storage_usage_info.family_usage = FamilyStorageUsageInfo.fromResponse(response.familyStorageUsageInfo);
        }

        return storage_usage_info;
    }
}

class QuotaStatus {
    constructor(over_quota, approaching_quota, has_paid_tier, has_max_tier) {
        this.over_quota = over_quota;
        this.approaching_quota = approaching_quota;
        this.has_paid_tier = has_paid_tier;
        this.has_max_tier;
    }

    static fromResponse(response) {
        const quota_status = new QuotaStatus(response.overQuota, response['almost-full'], response.paidQuota, response.haveMaxQuotaTier);

        quota_status.response = response;

        return quota_status;
    }
}

class MediaTypeStorageUsageInfo {
    constructor(id, usage, label, colour) {
        this.id = id;
        this.usage = usage;
        this.label = label;
        this.colour = colour;
    }

    static fromResponse(response) {
        const media_type = new MediaTypeStorageUsageInfo(response.mediaKey, response.usageInBytes, response.displayLabel, response.displayColor);

        media_type.response = response;

        return media_type;
    }
}

class FamilyStorageUsageInfo extends MediaTypeStorageUsageInfo {
    constructor(id, usage, label, colour, family_members) {
        super(id, usage, label, colour);

        this.family_members = family_members || [];
    }

    static fromResponse(response) {
        const media_type = new FamilyStorageUsageInfo(response.mediaKey, response.usageInBytes, response.displayLabel, response.displayColor);

        media_type.response = response;

        for (let family_member of response.familyMembers) {
            media_type.family_members.push(FamilyMemberStorageUsageInfo.fromResponse(family_member));
        }

        return media_type;
    }
}

class FamilyMemberStorageUsageInfo {
    constructor(id, usage, name) {
        this.id = id;
        this.usage = usage;
        this.name = name;
    }

    static fromResponse(response) {
        const family_member = new FamilyStorageUsageInfo(response.dsid, response.usage, response.fullName);

        family_member.response = response;

        return family_member;
    }
}

class FamilyDetails {
    constructor(family, members, can_add_member) {
        this.has_family = !!family;
        this.family = family;
        this.members = members || [];
        this.can_add_member = can_add_member || false;

        this.invitations = [];
        this.outgoing_transfer_requests = [];
    }

    static fromResponse(response) {
        const family_details = new FamilyDetails();

        family_details.response = response;
        family_details.has_family = response.isMemberOfFamily;
        family_details.family = response.family ? Family.fromResponse(response.family) : undefined;
        family_details.can_add_member = response.showAddMemberButton;

        for (let family_member of response.familyMembers || []) {
            family_details.members.push(FamilyMember.fromResponse(family_member));
        }

        return family_details;
    }
}

class Family {
    constructor(id, organiser_id, member_ids) {
        this.id = id;
        this.organiser_id = organiser_id;
        this.member_ids = member_ids;
    }

    static fromResponse(response) {
        const family = new Family(response.familyId, response.organizer, response.members);

        family.response = response;

        return family;
    }
}

class FamilyMember {
    constructor(id, name, apple_id) {
        this.id = id;
        this.name = name;
        this.first_name = undefined;
        this.last_name = undefined;
        this.apple_id = apple_id;
        this.original_invitation_email = apple_id;
        this.family_id = undefined;
        this.age_classification = undefined;
        this.age = undefined;
        this.itunes_id = undefined;
        this.itunes_apple_id = undefined;
        this.has_parental_privileges = undefined;
        this.has_screen_time = undefined;
        this.has_ask_to_buy = undefined;
        this.has_share_purchases = undefined;
        this.has_share_my_location = undefined;
        // this.share_my_location_family_members = [];
    }

    static fromResponse(response) {
        const family_member = new FamilyMember(response.dsid, response.fullName, response.appleId);

        family_member.response = response;
        family_member.first_name = response.firstName;
        family_member.last_name = response.lastName;
        family_member.original_invitation_email = response.originalInvitationEmail;
        family_member.family_id = response.familyId;
        family_member.age_classification = response.ageClassification;
        family_member.age = response.age;
        family_member.itunes_id = response.dsidForPurchases;
        family_member.itunes_apple_id = response.appleIdForPurchases;
        family_member.has_parental_privileges = response.hasParentalPrivileges;
        family_member.has_screen_time = response.hasScreenTimeEnabled;
        family_member.has_ask_to_buy = response.hasAskToBuyEnabled;
        family_member.has_share_purchases = response.hasSharePurchasesEnabled;
        family_member.has_share_my_location = response.hasShareMyLocationEnabled;

        // for (let share_my_location_family_member of response.shareMyLocationEnabledFamilyMembers) {
        //     family_member.share_my_location_family_members.push(share_my_location_family_member);
        // }

        return family_member;
    }
}

class DeviceDetails {
    constructor(devices, payment_methods) {
        this.devices = devices || [];
        this.payment_methods = payment_methods || [];
    }

    static fromResponse(response) {
        const device_details = new DeviceDetails();

        device_details.response = response;

        for (let device of response.devices || []) {
            device_details.devices.push(Device.fromResponse(device));
        }

        for (let payment_method of response.payment_methods || []) {
            device_details.payment_methods.push(PaymentMethod.fromResponse(payment_method));
        }

        return device_details;
    }
}

class Device {
    constructor(udid, name, model, model_display_name, os_version, serial_number) {
        this.udid = udid;
        this.name = name;
        this.model = model;
        this.model_display_name = model_display_name;
        this.os_version = os_version;
        this.serial_number = serial_number;
        this.imei = undefined;
        this.last_backup = undefined;

        this.model_small_photo_url = undefined;
        this.model_small_photo_url_2x = undefined;
        this.model_large_photo_url = undefined;
        this.model_large_photo_url_2x = undefined;

        this.payment_method_ids = [];
    }

    static fromResponse(response) {
        const device = new Device(response.udid, response.name, response.model, response.modelDisplayName, response.osVersion, response.serialNumber);

        device.response = response;
        device.imei = response.imei;
        device.last_backup = response.latestBackup ? new Date(response.latestBackup) : undefined;

        device.model_small_photo_url = response.modelSmallPhotoURL1x;
        device.model_small_photo_url_2x = response.modelSmallPhotoURL2x;
        device.model_large_photo_url = response.modelLargePhotoURL1x;
        device.model_large_photo_url_2x = response.modelLargePhotoURL2x;

        device.payment_method_ids = response.paymentMethods || [];

        return device;
    }
}

class PaymentMethod {
    constructor(id, type, balance_status, last_four_digits) {
        this.id = id;
        this.type = type;
        this.balance_status = balance_status;
        this.last_four_digits = last_four_digits;
        this.suspension_reason = undefined;
    }

    static fromResponse(response) {
        const payment_method = new PaymentMethod(response.id, response.type, response.balanceStatus, response.lastFourDigits);

        payment_method.response = response;
        payment_method.suspension_reason = response.suspensionReason;

        return payment_method;
    }
}
