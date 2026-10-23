// 서버 오류를 누구나 이해할 수 있는 말로
export function friendly(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? err ?? '');
  const map: Array<[RegExp, string]> = [
    [/invalid_code/, '초대 코드가 맞지 않아요. 다시 확인해 주세요.'],
    [/create_not_allowed/, '새 앨범은 이미 앨범에 들어와 있는 사람만 만들 수 있어요. 받은 초대 코드로 먼저 들어와 주세요.'],
    [/not_signed_in/, '먼저 로그인해 주세요.'],
    [/not_owner/, '앨범 관리자만 할 수 있어요.'],
    [/not_member/, '이 앨범의 멤버만 볼 수 있어요.'],
    [/last_owner/, '관리자는 최소 한 명 있어야 해요.'],
    [/use_leave/, '나 자신은 [앨범 나가기]로 나갈 수 있어요.'],
    [/sole_member/, '나 혼자 있는 앨범이 있어요. 그 앨범을 먼저 지워 주세요.'],
    [/drive_connected/, '내 구글 드라이브에 연결된 앨범이 있어요. 앨범 설정 → 사진 저장 위치에서 연결을 먼저 끊어 주세요.'],
    [/bad_photo_path/, '사진 정보가 올바르지 않아요. 다시 올려 주세요.'],
    [/drive_only/, '사진은 구글 드라이브에만 올릴 수 있어요. 앱을 닫았다가 다시 열어 주세요.'],
    [/drive_not_connected|drive_reconnect|drive_auth/, '구글 로그인이 풀렸어요. + 를 누르거나 설정 → 내 구글 드라이브에서 다시 구글 로그인해 주세요.'],
    [/drive_quota/, '구글 드라이브 공간이 가득 찼어요.'],
    [/drive_not_configured/, '구글 클라이언트 ID·보안 비밀번호가 서버에 아직 없어요. (설명서 6-6)'],
    [/drive_bad_secret/, '서버의 GOOGLE_CLIENT_SECRET이 클라이언트 ID와 맞지 않아요. (설명서 6-6)'],
    [/drive_api_disabled/, 'Google Drive API가 아직 꺼져 있어요. (설명서 6-1)'],
    [/drive_scope_missing/, '구글 화면에서 ‘Google Drive 파일’ 항목에 체크한 뒤 계속을 눌러 주세요.'],
    [/drive_code_expired|drive_no_refresh_token/, '구글 로그인이 중간에 끊겼어요. 한 번 더 눌러 주세요.'],
    [/drive_folder_failed/, '드라이브에 앨범 폴더를 만들지 못했어요. 잠시 후 다시 해 주세요.'],
    [/drive_share_failed/, '앨범 폴더를 링크로 공유하지 못했어요. 회사·학교 구글 계정은 링크 공유가 막혀 있을 수 있어요. 개인 Gmail 계정으로 구글 로그인해 주세요.'],
    [/^offline$/, '인터넷 연결을 확인해 주세요.'],
    [/drive_401/, '서버 기능(drive)의 Verify JWT를 꺼 주세요. (설명서 6-5)'],
    [/drive_404|Function not found|drive_5\d\d/, '구글 드라이브 기능이 아직 설정되지 않았어요. (설명서 6번)'],
    [/Failed to fetch|NetworkError|Load failed|network/i, '인터넷 연결을 확인해 주세요.'],
    [/row-level security|permission denied/i, '권한이 없어요.'],
    [/Payload too large|exceeded the maximum/i, '사진 용량이 너무 커요.'],
    [/provider is not enabled|Unsupported provider/i, '이 로그인 방법이 아직 켜져 있지 않아요. (설명서의 로그인 단계)'],
    [/rate limit|too many/i, '잠시 후에 다시 시도해 주세요.'],
    [/relation .* does not exist|schema cache|Could not find the function|column .* does not exist|families_kind_check|families_days_check/i, 'Supabase에 새 데이터베이스 설정이 필요해요. SQL Editor에서 schema.sql을 한 번 더 실행해 주세요. (설명서 참고)'],
  ];
  for (const [re, ko] of map) if (re.test(msg)) return ko;
  return msg || '알 수 없는 문제가 생겼어요.';
}
