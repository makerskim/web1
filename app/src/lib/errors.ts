// 서버 오류를 누구나 이해할 수 있는 말로
export function friendly(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? err ?? '');
  const map: Array<[RegExp, string]> = [
    [/invalid_code/, '초대 코드가 맞지 않아요. 다시 확인해 주세요.'],
    [/create_not_allowed/, '새 앨범은 이미 가족 앨범에 들어와 있는 사람만 만들 수 있어요. 받은 초대 코드로 먼저 들어와 주세요.'],
    [/not_signed_in/, '먼저 로그인해 주세요.'],
    [/not_owner/, '앨범 관리자만 할 수 있어요.'],
    [/not_member/, '이 앨범의 가족만 볼 수 있어요.'],
    [/last_owner/, '관리자는 최소 한 명 있어야 해요.'],
    [/use_leave/, '나 자신은 [앨범 나가기]로 나갈 수 있어요.'],
    [/sole_member/, '나 혼자 있는 앨범이 있어요. 그 앨범을 먼저 지워 주세요.'],
    [/bad_photo_path/, '사진 정보가 올바르지 않아요. 다시 올려 주세요.'],
    [/drive_not_connected/, '이 앨범의 구글 드라이브 연결이 끊겼어요. 관리자에게 다시 연결해 달라고 해 주세요.'],
    [/drive_quota/, '구글 드라이브 공간이 가득 찼어요.'],
    [/drive_404|Function not found|drive_5\d\d/, '구글 드라이브 기능이 아직 설정되지 않았어요. (설명서의 드라이브 단계)'],
    [/Failed to fetch|NetworkError|Load failed|network/i, '인터넷 연결을 확인해 주세요.'],
    [/row-level security|permission denied/i, '권한이 없어요.'],
    [/Payload too large|exceeded the maximum/i, '사진 용량이 너무 커요.'],
    [/provider is not enabled|Unsupported provider/i, '이 로그인 방법이 아직 켜져 있지 않아요. (설명서의 로그인 단계)'],
    [/rate limit|too many/i, '잠시 후에 다시 시도해 주세요.'],
    [/relation .* does not exist|schema cache|Could not find the function/i, 'Supabase에 데이터베이스 설정(schema.sql)이 아직 안 되어 있어요.'],
  ];
  for (const [re, ko] of map) if (re.test(msg)) return ko;
  return msg || '알 수 없는 문제가 생겼어요.';
}
