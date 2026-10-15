// 서버 오류를 할머니·할아버지도 이해할 수 있는 말로
export function friendly(err) {
  const msg = String(err?.message || err || '');
  const map = [
    [/invalid_code/, '초대 코드가 맞지 않아요. 다시 한 번 확인해 주세요.'],
    [/create_not_allowed/, '새 앨범은 이미 가족 앨범에 들어와 있는 사람만 만들 수 있어요. 가족에게 받은 초대 링크로 먼저 들어와 주세요.'],
    [/not_owner/, '앨범 관리자만 할 수 있어요.'],
    [/last_owner/, '관리자는 최소 한 명 있어야 해요.'],
    [/use_leave/, '나 자신은 [앨범에서 나가기]로 나갈 수 있어요.'],
    [/not_member/, '이 앨범의 가족만 볼 수 있어요.'],
    [/bad_photo_path/, '사진 정보가 올바르지 않아요. 다시 올려 주세요.'],
    [/Anonymous sign-ins are disabled/i, 'Supabase 설정에서 “Anonymous sign-ins(익명 로그인)”를 켜 주세요. (설명서 3단계)'],
    [/Failed to fetch|NetworkError|Load failed|network/i, '인터넷 연결을 확인해 주세요.'],
    [/row-level security|permission denied/i, '권한이 없어요. 앨범에 다시 들어와 주세요.'],
    [/Payload too large|exceeded the maximum/i, '사진 용량이 너무 커요.'],
    [/Token has expired or is invalid|otp/i, '인증번호가 맞지 않거나 시간이 지났어요. 다시 받아 주세요.'],
    [/rate limit|too many/i, '잠시 후에 다시 시도해 주세요. (요청이 너무 많아요)'],
    [/Signups not allowed|User not found/i, '이 이메일로 연결된 계정이 없어요.'],
    [/relation .* does not exist|schema cache|Could not find the function/i, 'Supabase에 데이터베이스 설정(schema.sql)이 아직 안 되어 있어요. (설명서 2단계)'],
  ];
  for (const [re, ko] of map) if (re.test(msg)) return ko;
  return msg || '알 수 없는 문제가 생겼어요.';
}
