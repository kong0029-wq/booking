export const createGoogleEvent = async (accessToken: string, eventData: { title: string, startDateTime: string, endDateTime: string, description?: string }) => {
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: eventData.title,
      description: eventData.description || '예약 프로그램에서 생성된 수업입니다.',
      start: {
        dateTime: eventData.startDateTime, // ISO-8601 형식 (예: 2026-06-09T10:00:00+09:00)
        timeZone: 'Asia/Seoul',
      },
      end: {
        dateTime: eventData.endDateTime,
        timeZone: 'Asia/Seoul',
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('EXPIRED_TOKEN');
    throw new Error('Google Calendar API Error');
  }

  const data = await response.json();
  return data.id; // 구글 캘린더에서 발급한 이벤트 ID 반환
};

export const updateGoogleEvent = async (accessToken: string, eventId: string, eventData: { title: string, startDateTime: string, endDateTime: string, description?: string }) => {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: eventData.title,
      description: eventData.description || '예약 프로그램에서 생성된 수업입니다.',
      start: {
        dateTime: eventData.startDateTime,
        timeZone: 'Asia/Seoul',
      },
      end: {
        dateTime: eventData.endDateTime,
        timeZone: 'Asia/Seoul',
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('EXPIRED_TOKEN');
    // 이벤트가 이미 삭제되었거나 없는 경우도 에러를 무시하거나 던짐
    if (response.status === 404) return null;
    throw new Error('Google Calendar API Error');
  }

  return await response.json();
};

export const deleteGoogleEvent = async (accessToken: string, eventId: string) => {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('EXPIRED_TOKEN');
    if (response.status === 404) return; // 이미 삭제된 경우 예외 처리 안 함
    // 다른 에러의 경우 로깅하거나 무시 (로컬 DB 삭제를 방해하지 않도록)
  }
};
