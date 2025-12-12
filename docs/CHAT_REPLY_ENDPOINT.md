# Chat Reply Endpoint Documentation

## Endpoint: `/api/v1/chat/reply`

### Description
هذا الـ endpoint يقوم بتوليد رد على رسالة محددة بدلاً من المرسل الأصلي. يستخدم AI لفهم السياق وتوليد رد مناسب.

### Method
`POST`

### Request Body
```json
{
  "roomId": "string (required)",
  "senderId": "string (required)",
  "messageId": "string (required)"
}
```

### Parameters
- **roomId**: معرف الغرفة التي تحتوي على الرسالة
- **senderId**: معرف المرسل الذي سيتم الرد بدلاً منه
- **messageId**: معرف الرسالة المطلوب الرد عليها (من payload.message_id وليس Qdrant UUID)

### Response

#### Success Response (200)
```json
{
  "success": true,
  "answer": "الرد المولد على الرسالة",
  "suggestedAnswer": "رد بديل أقصر (اختياري)",
  "provider": "اسم مزود AI",
  "model": "اسم النموذج المستخدم",
  "targetMessage": {
    "id": "معرف الرسالة",
    "sender_id": "معرف المرسل الأصلي",
    "sender_name": "اسم المرسل الأصلي",
    "message_text": "نص الرسالة الأصلية",
    "createdAt": "تاريخ إنشاء الرسالة"
  },
  "context": {
    "roomId": "معرف الغرفة",
    "senderId": "معرف المرسل",
    "hasRoomSummary": true/false,
    "hasUserPersonalization": true/false,
    "latestMessagesCount": 15
  },
  "metadata": {
    "generationTime": "500ms",
    "totalTime": "750ms",
    "provider": "اسم المزود",
    "model": "اسم النموذج"
  }
}
```

#### Error Responses

##### 400 - Bad Request
```json
{
  "success": false,
  "error": "Missing required fields: roomId, senderId, and messageId are required"
}
```

##### 403 - Forbidden
```json
{
  "success": false,
  "error": "لا يمكنك الرد على رسالتك الخاصة"
}
```

##### 404 - Message Not Found
```json
{
  "success": false,
  "error": "انتظر وحاول بعد لحظات"
}
```

##### 500 - Internal Server Error
```json
{
  "success": false,
  "error": "Failed to generate message reply",
  "details": "تفاصيل الخطأ"
}
```

### Example Usage

#### cURL
```bash
curl -X POST http://localhost:3000/api/v1/chat/reply \
  -H "Content-Type: application/json" \
  -d '{
    "roomId": "room_123",
    "senderId": "user_456",
    "messageId": "msg_789"
  }'
```

#### JavaScript (Fetch)
```javascript
const response = await fetch('http://localhost:3000/api/v1/chat/reply', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    roomId: 'room_123',
    senderId: 'user_456',
    messageId: 'msg_789'
  })
});

const data = await response.json();
console.log(data.answer);
```

### How It Works

1. **يبحث عن الرسالة المحددة** في Qdrant باستخدام `message_id` و `room_id`
2. **يتحقق من صلاحية الرد** - يتأكد أن الرسالة ليست من نفس الشخص (`senderId ≠ message.sender_id`)
3. **يجلب السياق** من:
   - ملخص الغرفة (room summary)
   - معلومات المرسل (user personalization)
   - آخر 15 رسالة في الغرفة
4. **يبني prompt مخصص** يركز على الرسالة المطلوب الرد عليها
5. **يولد الرد** باستخدام AI model مع مراعاة:
   - السياق الكامل للمحادثة
   - أسلوب ولغة الرسالة الأصلية
   - الطبيعية والتناسق مع المحادثة
6. **يرجع الرد** بدون حفظه في قاعدة البيانات

### Key Differences from `/chat` Endpoint

| Feature | `/chat` | `/reply` |
|---------|---------|----------|
| Purpose | الرد على سؤال المستخدم | الرد على رسالة محددة بدلاً من المرسل |
| Input | `userQuestion` | `messageId` |
| Context | محادثات AI السابقة + رسائل الغرفة | رسائل الغرفة فقط |
| Storage | يحفظ في AI chat history | لا يحفظ |
| Prompt | prompt عام للمحادثة | prompt مخصص للرد على رسالة |
| System Prompt | "ميجو" كعضو في الغرفة | AI يرد بدلاً من المرسل |
| Validation | لا يوجد | يمنع الرد على رسائلك الخاصة |

### Notes

- ⚠️ **مهم**: `messageId` يجب أن يكون من `payload.message_id` وليس Qdrant UUID
- 🚫 **تقييد**: لا يمكنك الرد على رسالتك الخاصة - فقط رسائل الأشخاص الآخرين
- 📝 الرد لا يتم حفظه في قاعدة البيانات
- 🎯 AI يركز على الرسالة المحددة والسياق المحيط بها
- 🌍 AI يرد بنفس اللغة والأسلوب المستخدم في الرسالة الأصلية
- ⏱️ إذا لم يتم العثور على الرسالة، يرجع خطأ "انتظر وحاول بعد لحظات"
