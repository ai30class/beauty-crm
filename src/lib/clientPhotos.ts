import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/client/supabase';
import { CLIENT_PHOTO_BUCKET, getMyShopOwnerId } from '@/db/api';

// 顧客施術前後照片（私有空間，見 migration 00083）。
// 路徑第一段是店家 ID：資料庫政策只讓該店家本人與所屬員工存取自己店家資料夾裡的檔案。

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes.buffer;
}

export interface PhotoAsset {
  uri: string;
  mimeType?: string | null;
  width?: number | null;
}

// 縮到寬度 1080 以內再上傳，回傳存進資料庫的檔案路徑
export async function uploadClientPhoto(asset: PhotoAsset): Promise<string> {
  const ownerId = await getMyShopOwnerId();
  const isPng = asset.mimeType === 'image/png';
  const format = isPng ? SaveFormat.PNG : SaveFormat.JPEG;
  const actions = (asset.width && asset.width > 1080) ? [{ resize: { width: 1080 } }] : [];
  const compressed = await manipulateAsync(asset.uri, actions, { compress: isPng ? 1 : 0.8, format });
  const ext = isPng ? 'png' : 'jpg';
  const path = `${ownerId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(compressed.uri, { encoding: 'base64' });
  const { error } = await supabase.storage.from(CLIENT_PHOTO_BUCKET).upload(path, base64ToArrayBuffer(base64), {
    contentType: isPng ? 'image/png' : 'image/jpeg', upsert: false,
  });
  if (error) throw error;
  return path;
}

// 拍照或選相簿（都會先讓使用者裁切）。denied＝沒有相機／相簿權限；都沒有＝使用者取消
export async function pickClientPhoto(
  source: 'camera' | 'gallery',
): Promise<{ asset?: ImagePicker.ImagePickerAsset; denied?: boolean }> {
  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return { denied: true };
    const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 1 });
    return r.canceled ? {} : { asset: r.assets[0] };
  }
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return { denied: true };
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 1 });
  return r.canceled ? {} : { asset: r.assets[0] };
}
