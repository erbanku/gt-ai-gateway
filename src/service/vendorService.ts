import { SgVendor } from "../model/sgVendor";


async function getVendorByName(name: string): Promise<SgVendor | null> {
    if (name == null) {
        return null;
    }

    return await SgVendor.query().where("name", name).first();
}


async function updateVendor(
    vendorId: number,
    data: { type?: string; name?: string; token?: string; urls?: Record<string, string> },
): Promise<SgVendor | null> {
    const vendor = await SgVendor.query().find(vendorId);

    if (!vendor) {
        return null;
    }

    const updateData: any = {
        type: data.type ?? vendor.type,
        name: data.name ?? vendor.name,
        token: data.token ?? vendor.token,
    };

    // Handle urls - if provided, serialize as JSON string
    if (data.urls !== undefined) {
        updateData.urls = JSON.stringify(data.urls);
    }

    await SgVendor.query()
        .where("id", vendorId)
        .update(updateData);

    return await SgVendor.query().find(vendorId);
}

export default {
    getVendorByName,
    updateVendor,
};
